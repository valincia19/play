/**
 * S3 Helpers — extracted from video/processor.ts
 *
 * Provides S3 client caching, upload/download primitives,
 * batch upload, and eventual-consistency wait logic.
 */

import { createReadStream, createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { createS3Client } from './s3'
import { storageService } from '../modules/storage'
import { logger } from './logger'

// ─── S3 Client Cache ──────────────────────────────────────────────────

const s3ClientCache = new Map<string, { client: S3Client; usedAt: number }>()
const S3_CACHE_EXPIRY = 10 * 60 * 1000 // 10 minutes
let s3CleanupInterval: NodeJS.Timeout | null = null

export async function getCachedS3Client(bucketId: string): Promise<S3Client> {
  const cached = s3ClientCache.get(bucketId)

  if (cached && Date.now() - cached.usedAt < S3_CACHE_EXPIRY) {
    cached.usedAt = Date.now()
    return cached.client
  }

  const creds = await storageService.getBucketCredentials(bucketId)
  const client = createS3Client(creds)

  s3ClientCache.set(bucketId, { client, usedAt: Date.now() })

  // Start cleanup interval if not already running
  if (!s3CleanupInterval) {
    s3CleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, { usedAt, client }] of s3ClientCache) {
        if (now - usedAt > S3_CACHE_EXPIRY) {
          try {
            client.destroy()
          } catch {}
          s3ClientCache.delete(key)
        }
      }
    }, 5 * 60 * 1000) // Check every 5 minutes
  }

  return client
}

export function cleanupS3Cache(): void {
  if (s3CleanupInterval) {
    clearInterval(s3CleanupInterval)
    s3CleanupInterval = null
  }
  for (const { client } of s3ClientCache.values()) {
    try {
      client.destroy()
    } catch {}
  }
  s3ClientCache.clear()
}

// ─── S3 Error Types ───────────────────────────────────────────────────

export class S3ObjectError extends Error {
  httpStatus: number
  code: string
  retryable: boolean
  constructor(message: string, httpStatus: number, code: string, retryable: boolean = false) {
    super(message)
    this.name = 'S3ObjectError'
    this.httpStatus = httpStatus
    this.code = code
    this.retryable = retryable
  }
}

// ─── Constants ────────────────────────────────────────────────────────

/** S3 error codes that mean "object does not exist yet" */
const NOT_FOUND_CODES = new Set(['NotFound', 'NoSuchKey', 'Unknown', '404'])

/** HTTP status codes that indicate a transient / retryable S3 error */
const TRANSIENT_HTTP_CODES = new Set([403, 404, 408, 429, 500, 502, 503, 504])

// ─── S3 Wait (Eventual Consistency) ───────────────────────────────────

export interface WaitForS3ObjectResult {
  contentLength: number
  contentType?: string
  lastModified?: Date
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Wait until an S3 object is available and accessible.
 *
 * Uses exponential backoff to handle race conditions (object not yet visible
 * after upload completion) and temporary 403 errors (common on S3-compat providers).
 */
export async function waitForS3Object(
  s3: S3Client,
  bucket: string,
  key: string,
  opts: { maxRetries?: number; baseDelayMs?: number; videoId?: string } = {}
): Promise<WaitForS3ObjectResult> {
  const { maxRetries = 6, baseDelayMs = 2000, videoId = 'unknown' } = opts

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))

      // Guard against 0-byte objects (upload still in progress/finalizing)
      if (!head.ContentLength || head.ContentLength === 0) {
        logger.warn({ event: 's3_wait_empty', videoId, attempt, key })
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1)
          await sleep(delay)
          continue
        }
        throw new S3ObjectError(
          `S3 object "${key}" is 0 bytes after ${maxRetries} checks — upload appears incomplete`,
          0, 'EmptyObject', false
        )
      }

      // Double-check: re-HEAD after a short delay to confirm eventual consistency
      await sleep(500)
      const recheck = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
      if (!recheck.ContentLength || recheck.ContentLength !== head.ContentLength) {
        logger.warn({
          event: 's3_consistency_mismatch',
          videoId, attempt, key,
          firstSize: head.ContentLength,
          secondSize: recheck.ContentLength,
        })
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1)
          await sleep(delay)
          continue
        }
        throw new S3ObjectError(
          `S3 object "${key}" size inconsistent: ${head.ContentLength} vs ${recheck.ContentLength}`,
          0, 'ConsistencyError', true
        )
      }

      return {
        contentLength: head.ContentLength,
        contentType: head.ContentType,
        lastModified: head.LastModified,
      }
    } catch (err: any) {
      if (err instanceof S3ObjectError) throw err

      const httpStatus: number = err.$metadata?.httpStatusCode ?? 0
      const errorCode: string = err.Code || err.name || 'Unknown'
      const errorMsg: string = err.message || 'No message'

      const isRetryable = TRANSIENT_HTTP_CODES.has(httpStatus) || NOT_FOUND_CODES.has(errorCode)

      logger.warn({
        event: 's3_wait_retry',
        videoId,
        attempt,
        isRetryable,
        httpStatus,
        code: errorCode,
        message: errorMsg,
      })

      if (!isRetryable || attempt >= maxRetries) {
        throw new S3ObjectError(
          `S3 object check failed for "${key}": ${errorCode} (${httpStatus}) — ${errorMsg}`,
          httpStatus,
          errorCode,
          attempt < maxRetries
        )
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      await sleep(delay)
    }
  }

  throw new S3ObjectError(`Max retries exceeded for S3 object "${key}"`, 0, 'MaxRetries', true)
}

// ─── S3 Download/Upload Primitives ────────────────────────────────────

/**
 * Download from S3 directly to disk using streaming.
 */
export async function bunDownloadFromS3(
  s3: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  videoId: string,
  timeoutMs: number = 300_000
): Promise<void> {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: abort.signal as any }
    )
    if (!res.Body) throw new Error('S3 download failed: empty body')

    await pipeline(
      Readable.fromWeb(res.Body.transformToWebStream() as globalThis.ReadableStream<Uint8Array>),
      createWriteStream(localPath)
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Upload a local file to S3 using a Node file stream.
 */
export async function bunUploadToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  contentType: string,
  sseParams: Record<string, any> = {}
): Promise<void> {
  const fs = await import('fs/promises')
  const stat = await fs.stat(localPath)
  const fileStream = createReadStream(localPath)

  try {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: stat.size,
      ...sseParams,
    }))
  } finally {
    fileStream.destroy()
  }
}

/**
 * Upload multiple files to S3 in parallel batches.
 */
export async function batchUploadToS3(
  s3: S3Client,
  bucket: string,
  files: Array<{ localPath: string; key: string; contentType: string }>,
  concurrency: number,
  sseParams: Record<string, any> = {}
): Promise<void> {
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= files.length) return
      const file = files[index]
      if (!file) return
      await bunUploadToS3(s3, bucket, file.key, file.localPath, file.contentType, sseParams)
    }
  })

  await Promise.all(workers)
}