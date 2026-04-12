import { Queue, UnrecoverableError } from 'bullmq'
import { redisManager } from '../../utils/redis'
import { logger } from '../../utils/logger'
import { db, videos } from '../../schema'
import { eq, and, sql, lt, like, or } from 'drizzle-orm'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { MB, GB } from '../../utils/constants'

import { createReadStream, createWriteStream } from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { storageService } from '../storage'
import { GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { createS3Client } from '../../utils/s3'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const execFileAsync = promisify(execFile)

const VIDEO_QUEUE_NAME = 'video-processing'
const TEMP_DIR = path.join(process.cwd(), 'tmp-processing')

// Ensure temp dir exists — awaited so first job never races against mkdir
await fs.mkdir(TEMP_DIR, { recursive: true }).catch((err) => {
  logger.error({ event: 'temp_dir_create_failed', error: err.message, stack: err.stack })
})

export const videoQueue: Queue = new Queue(VIDEO_QUEUE_NAME, {
  connection: redisManager.duplicate(),
  defaultJobOptions: {
    attempts: 2,          // 2 total attempts — fail fast, fallback handles the rest
    backoff: {
      type: 'exponential',
      delay: 3000,        // 3s → 6s
    },
    removeOnComplete: true,
    removeOnFail: false,
  }
})

// ─── Adaptive Memory Config ────────────────────────────────────
// Detects system RAM and tunes all buffer/concurrency/thread values
// so it works well on a 1GB VPS and also a 32GB workstation.


interface MemoryProfile {
  /** Label for logging */
  tier: 'low' | 'medium' | 'high'
  /** How many HLS files to upload to S3 in parallel */
  uploadConcurrency: number
  /** highWaterMark for Bun.file().stream() when uploading */
  streamBufferSize: number
  /** Threads per FFmpeg video rendition */
  ffmpegThreadsPerQuality: number
  /** Max qualities to encode simultaneously */
  maxSimultaneousQualities: number
  /** Bun.write chunk hint for S3 download */
  downloadBufferSize: number
  /** HLS segment duration in seconds for typical VOD output */
  hlsSegmentDuration: number
  /** Adaptive encoder preset chosen for this memory tier */
  ffmpegPreset: 'superfast' | 'veryfast'
}

function detectMemoryProfile(): MemoryProfile {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  // Use the LOWER of total/2 or free — safer on shared hosts
  const usable = Math.min(totalMem / 2, freeMem)

  if (usable < 1 * GB) {
    // Low-memory (< 1GB usable): conservative settings
    return {
      tier: 'low',
      uploadConcurrency: 2,
      streamBufferSize: 256 * 1024,        // 256KB
      ffmpegThreadsPerQuality: 1,
      maxSimultaneousQualities: 1,         // Sequential encoding to avoid OOM
      downloadBufferSize: 512 * 1024,      // 512KB
      hlsSegmentDuration: 8,
      ffmpegPreset: 'superfast',
    }
  } else if (usable < 4 * GB) {
    // Medium-memory (1-4GB usable): conservative untuk server kecil
    return {
      tier: 'medium',
      uploadConcurrency: 4,                // Naik agar upload HLS kecil tidak terlalu serial
      streamBufferSize: 512 * 1024,        // 512KB (lebih kecil)
      ffmpegThreadsPerQuality: 1,            // 1 thread per quality (CPU efficient)
      maxSimultaneousQualities: 2,          // Max 2 qualities untuk 3GB server
      downloadBufferSize: 1 * MB,            // 1MB
      hlsSegmentDuration: 6,
      ffmpegPreset: 'superfast',
    }
  } else {
    // High-memory (> 4GB usable): aggressive throughput
    return {
      tier: 'high',
      uploadConcurrency: 8,
      streamBufferSize: 4 * MB,            // 4MB
      ffmpegThreadsPerQuality: 4,
      maxSimultaneousQualities: 5,
      downloadBufferSize: 8 * MB,          // 8MB
      hlsSegmentDuration: 4,
      ffmpegPreset: 'veryfast',
    }
  }
}

// Compute once at boot, re-use everywhere
const memProfile = detectMemoryProfile()
logger.info({
  event: 'memory_profile_detected',
  tier: memProfile.tier,
  totalMemMB: Math.round(os.totalmem() / MB),
  freeMemMB: Math.round(os.freemem() / MB),
  uploadConcurrency: memProfile.uploadConcurrency,
  ffmpegThreads: memProfile.ffmpegThreadsPerQuality,
  ffmpegPreset: memProfile.ffmpegPreset,
  hlsSegmentDuration: memProfile.hlsSegmentDuration,
})

// ─── S3 Client Cache (Simple Reuse) ───────────────────────────────
const s3ClientCache = new Map<string, { client: S3Client; usedAt: number }>()
const S3_CACHE_EXPIRY = 10 * 60 * 1000 // 10 minutes
let s3CleanupInterval: NodeJS.Timeout | null = null

async function getCachedS3Client(bucketId: string): Promise<S3Client> {
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

// Export for cleanup on shutdown
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

// ─── S3 Helpers ─────────────────────────────────────────────────

/** Set of S3 error codes that mean "object does not exist yet" */
const NOT_FOUND_CODES = new Set(['NotFound', 'NoSuchKey', 'Unknown', '404'])

/** Set of HTTP status codes that indicate a transient / retryable S3 error */
const TRANSIENT_HTTP_CODES = new Set([403, 404, 408, 429, 500, 502, 503, 504])

interface WaitForS3ObjectResult {
  contentLength: number
  contentType?: string
  lastModified?: Date
}

interface MediaInfo {
  duration: number
  hasAudio: boolean
}

/**
 * Wait until an S3 object is available and accessible.
 * 
 * Uses exponential backoff to handle race conditions (object not yet visible 
 * after upload completion) and temporary 403 errors (common on S3-compat providers).
 */
async function waitForS3Object(
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

/** Custom error class for S3 object availability issues */
class S3ObjectError extends Error {
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Error Types ────────────────────────────────────────────────

/** Errors that should immediately fail the job — no BullMQ retries */
class PermanentProcessingError extends UnrecoverableError {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentProcessingError'
  }
}

// ─── Bun-Native Helpers ─────────────────────────────────────────

/**
 * Download from S3 directly to disk using Bun.write().
 * 
 * Bun.write(path, response) uses kernel-level sendfile/splice syscalls
 * to write the response body to disk WITHOUT buffering the entire file
 * in JS heap memory. This is drastically more efficient than
 * pipeline(Readable, WriteStream) for large video files.
 */
async function bunDownloadFromS3(
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

    // Bun.write(Response) can hang with AWS SDK GetObject streams under Bun.
    // Bridging the web stream into a file stream keeps downloads reliable.
    await pipeline(
      Readable.fromWeb(res.Body.transformToWebStream() as globalThis.ReadableStream<Uint8Array>),
      createWriteStream(localPath)
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Upload a local file to S3 using Bun.file().stream().
 * 
 * Uses Bun's lazy file reference which only reads chunks from disk
 * on demand — no full-file buffering. The stream's internal buffer
 * is controlled by the memory profile.
 */
async function bunUploadToS3(
  s3: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  contentType: string,
  sseParams: Record<string, any> = {}
): Promise<void> {
  const stat = await fs.stat(localPath)
  const fileStream = createReadStream(localPath)

  try {
    // Node file streams behave reliably with AWS SDK checksum middleware
    // under Bun, while Bun.file().stream() can trip "flowing readable stream".
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
 * 
 * Concurrency is tuned by the memory profile:
 * - Low RAM (< 1GB) → 2 concurrent uploads
 * - Medium RAM (1-4GB) → 4 concurrent uploads  
 * - High RAM (> 4GB) → 8 concurrent uploads
 */
async function batchUploadToS3(
  s3: S3Client,
  bucket: string,
  files: Array<{ localPath: string; key: string; contentType: string }>,
  sseParams: Record<string, any> = {}
): Promise<void> {
  const concurrency = memProfile.uploadConcurrency
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

function getHlsSegmentDuration(durationSec: number, renditionCount: number): number {
  if (durationSec >= 30 * 60) return 8
  if (renditionCount <= 1 && durationSec >= 2 * 60) return Math.max(memProfile.hlsSegmentDuration, 6)
  if (renditionCount >= 3) return 4
  return memProfile.hlsSegmentDuration
}

// ─── Processor ──────────────────────────────────────────────────

export class VideoProcessor {
  /**
   * Safe FFmpeg wrapper using Bun.spawn.
   *
   * Bun.spawn advantages over Node's child_process.spawn:
   * - No EventEmitter GC overhead
   * - stdout/stderr can be "ignore"d at the OS level (no JS-side drain)
   * - proc.exited is a native Promise (no callback wrapping needed)
   * - stdin: null prevents accidental writes
   *
   * Timeout protection ensures no stuck encoding jobs.
   */
  private static async runFfmpeg(args: string[], videoId: string, timeoutMs: number = 3600000) {
    const proc = Bun.spawn([ffmpegInstaller.path, ...args], {
      stdin: null,
      stdout: 'ignore',
      stderr: 'pipe',
      windowsHide: true,
    })

    // Abort controller for timeout
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), timeoutMs)

    // Collect stderr lines for diagnostics on failure
    const stderrLines: string[] = []

    try {
      // Race: process exit vs timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        abort.signal.addEventListener('abort', () => {
          proc.kill(9)
          reject(new Error(`FFmpeg process timed out after ${timeoutMs}ms`))
        })
      })

      // Progress logging (non-critical, best-effort)
      if (proc.stderr) {
        const pump = async () => {
          try {
            const reader = proc.stderr.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let lastLogTime = Date.now()

            while (true) {
              const { done, value } = await reader.read()
              if (done || abort.signal.aborted) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split(/[\r\n]+/)
              buffer = lines.pop() || ''

              for (const line of lines) {
                const l = line.trim()
                if (!l) continue
                // Keep last N lines for error diagnostics
                stderrLines.push(l)
                if (stderrLines.length > 30) stderrLines.shift()
                if (l.startsWith('frame=') && Date.now() - lastLogTime > 5000) {
                  logger.info({ event: 'ffmpeg_progress', videoId, progress: l.replace(/\s+/g, ' ') })
                  lastLogTime = Date.now()
                }
              }
            }
          } catch {
            // Stream closed or aborted - ignore
          }
        }
        pump() // Non-critical logging, safe to fire-and-forget
      }

      const exitCode = await Promise.race([proc.exited, timeoutPromise]) as number

      if (exitCode !== 0) {
        // Log the last stderr lines for diagnostics
        if (stderrLines.length > 0) {
          const errorLines = stderrLines.filter(l => !l.startsWith('frame='))
          if (errorLines.length > 0) {
            logger.error({
              event: 'ffmpeg_stderr_tail',
              videoId,
              exitCode,
              lastLines: errorLines.slice(-10),
            })
          }
        }
        throw new Error(`FFmpeg failed with exit code ${exitCode}`)
      }
    } finally {
      clearTimeout(timeout)
      // Ensure process is cleaned up
      if (!proc.killed) {
        proc.kill(9)
      }
    }
  }

  /**
   * Validate FFmpeg output file using Bun.file (lazy — no disk read until .size).
   */
  private static async validateOutput(
    filePath: string,
    videoId: string,
    minBytes: number = 1024
  ): Promise<number> {
    const file = Bun.file(filePath)
    const exists = await file.exists()

    if (!exists) {
      throw new PermanentProcessingError(`FFmpeg output missing: ${filePath} does not exist`)
    }

    if (file.size < minBytes) {
      throw new PermanentProcessingError(
        `FFmpeg output too small: ${filePath} is ${file.size} bytes (min: ${minBytes})`
      )
    }

    logger.info({ event: 'ffmpeg_output_validated', videoId, path: filePath, size: file.size })
    return file.size
  }

  /**
   * Route video to appropriate processing pipeline.
   * MP4: process directly (lightweight, no queue)
   * HLS: add to queue (heavy processing)
   */
  static async queueProcessing(videoId: string) {
    // Fetch video info to determine processing path
    const [video] = await db.select({
      id: videos.id,
      userId: videos.userId,
      fileSizeBytes: videos.fileSizeBytes,
      processingMode: videos.processingMode,
      qualities: videos.qualities,
    }).from(videos).where(eq(videos.id, videoId)).limit(1)

    if (!video) {
      logger.error({ event: 'queue_processing_video_not_found', videoId })
      return
    }

    // MP4: Fire-and-forget lightweight processing (non-blocking)
    if (video.processingMode === 'mp4') {
      logger.info({
        event: 'video_processing_scheduled',
        videoId,
        userId: video.userId,
        fileSizeMB: video.fileSizeBytes ? +(video.fileSizeBytes / MB).toFixed(2) : undefined,
        processingMode: 'mp4',
        qualities: video.qualities,
        queued: false,
      })
      // Fire and forget — don't await, let upload response return immediately
      VideoProcessor.lightweightProcessing(videoId).catch((err) => {
        logger.error({ event: 'mp4_processing_failed', videoId, error: err.message, stack: err.stack })
      })
      return
    }

    // HLS: Add to queue (heavy processing)
    await videoQueue.add('process-video', { videoId }, { jobId: videoId, delay: 3000 })

    logger.info({
      event: 'video_queued',
      videoId,
      userId: video.userId,
      fileSizeMB: video.fileSizeBytes ? +(video.fileSizeBytes / MB).toFixed(2) : undefined,
      processingMode: video.processingMode,
      qualities: video.qualities,
      queued: true,
    })
  }

  /**
   * Import video from a remote URL. Usually called by 'import-video' worker job.
   * Downloads locally, uploads to S3, and standardizes it into the normal processing pipeline.
   */
  static async importVideo(videoId: string, remoteUrl: string) {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
    if (!video || !video.bucketId) throw new Error(`Video not found or no bucket`)

    await db.update(videos).set({ status: 'uploading' }).where(eq(videos.id, videoId))

    const jobDir = path.join(TEMP_DIR, videoId)
    await fs.mkdir(jobDir, { recursive: true })
    const localThumbPath = path.join(jobDir, 'thumbnail.webp')

    try {
      // Run ffmpeg directly against the HTTP URL to extract 1 frame
      // This is extremely fast because ffmpeg only buffers enough to decode the first keyframe (usually 1st second)
      await execFileAsync(ffmpegInstaller.path, [
        '-y',
        '-ss', '00:00:01.000',     // Seek to 1 second
        '-i', remoteUrl,           // Input is the remote HTTP URL
        '-vframes', '1',           // Extract only 1 frame
        '-vf', 'scale=640:-2',     // Consistent sizing
        '-c:v', 'libwebp',         // WebP output
        '-quality', '75',          // WebP quality
        localThumbPath
      ], { timeout: 30000 })       // 30s timeout is more than enough for 1 frame

      // Upload thumbnail to S3
      const thumbnailPath = `videos/${video.userId}/${videoId}/thumbnail.webp`
      const creds = await storageService.getBucketCredentials(video.bucketId)
      const s3 = await getCachedS3Client(video.bucketId)
      
      await bunUploadToS3(s3, creds.name, thumbnailPath, localThumbPath, 'image/webp')
      
      // Get media info (duration) remotely via ffprobe
      const info = await VideoProcessor.getMediaInfo(remoteUrl)

      // Successfully extracted thumbnail and uploaded! 
      // Mark proxy video as ready.
      await db.update(videos).set({ 
        status: 'ready', 
        thumbnailPath,
        duration: info.duration > 0 ? info.duration : null,
        errorMessage: null 
      }).where(eq(videos.id, videoId))

      logger.info({ event: 'proxy_video_imported_ready', videoId, url: remoteUrl })

    } finally {
      // Cleanup temp dir
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Extract video duration in seconds using ffprobe.
   * Validates file integrity before processing.
   */
  static async getMediaInfo(inputPath: string): Promise<MediaInfo> {
    try {
      const { stdout } = await execFileAsync(ffprobeInstaller.path, [
        '-v', 'error',
        '-show_entries', 'format=duration:stream=codec_type',
        '-of', 'json',
        inputPath,
      ], { timeout: 15000 }) // 15s timeout for probe

      const parsed = JSON.parse(stdout) as {
        format?: { duration?: string }
        streams?: Array<{ codec_type?: string }>
      }

      const rawDuration = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0
      const duration = isNaN(rawDuration) || rawDuration <= 0 ? 0 : Math.round(rawDuration)
      const hasAudio = Array.isArray(parsed.streams)
        ? parsed.streams.some((stream) => stream.codec_type === 'audio')
        : false

      return { duration, hasAudio }
    } catch (err: any) {
      logger.error({ event: 'ffprobe_failed', inputPath, error: err.message, stack: err.stack })
      return { duration: 0, hasAudio: false }
    }
  }

  /**
   * Worker entry point for all queued video processing.
   * Dispatches by processing mode so the worker is the single async executor.
   */
  static async processVideo(videoId: string) {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
    
    // 1. Validation
    if (!video || !video.bucketId) {
      throw new Error(`Video ${videoId} not found or has no bucket assigned`)
    }

    // 2. Proxy Check - Skip processing for external URLs (they are handled by importVideo)
    if (video.videoUrl?.startsWith('http')) {
      logger.info({ event: 'video_processing_proxy_skip', videoId })
      return
    }

    // 3. Idempotency check - skip only if truly done (ready)
    // "processing" is allowed to retry — previous attempt may have crashed mid-way
    if (video.status === 'ready') {
      logger.info({ event: 'video_processing_skip', videoId, currentStatus: video.status })
      return
    }

    if (video.processingMode === 'mp4') {
      await VideoProcessor.lightweightProcessing(videoId)
      return
    }

    const updateResult = await db.update(videos)
      .set({ status: 'processing', errorMessage: null, updatedAt: new Date() })
      .where(sql`${videos.id} = ${videoId} AND ${videos.status} IN ('pending', 'uploading', 'error', 'processing')`)
      .returning({ id: videos.id })

    if (updateResult.length === 0) {
      logger.warn({ event: 'video_processing_race', videoId, currentStatus: video.status })
      return
    }

    logger.info({
      event: 'video_processing_started',
      videoId,
      userId: video.userId,
      fileSizeMB: video.fileSizeBytes ? +(video.fileSizeBytes / MB).toFixed(2) : undefined,
      processingMode: video.processingMode,
      qualities: video.qualities,
    })

    // Local file structure — fully isolated per videoId
    const jobDir = path.join(TEMP_DIR, videoId)
    const localInputPath = path.join(jobDir, 'source.mp4')
    const localHlsDir = path.join(jobDir, 'hls')
    const localThumbPath = path.join(jobDir, 'thumbnail.webp')

    await fs.mkdir(localHlsDir, { recursive: true })

    let s3: S3Client | null = null
    const pipelineStartedAt = Date.now()
    let downloadCompletedAt = pipelineStartedAt
    let transcodeCompletedAt = pipelineStartedAt
    let hlsUploadCompletedAt = pipelineStartedAt
    let thumbCompletedAt = pipelineStartedAt
    let currentStep = 'init'

    try {
      s3 = await getCachedS3Client(video.bucketId!)

      const creds = await storageService.getBucketCredentials(video.bucketId!)
      const videoKey = video.videoUrl

      // 4. Wait for S3 object to become available (handles eventual consistency)
      const objMeta = await waitForS3Object(s3, creds.name, videoKey, {
        maxRetries: 8,
        baseDelayMs: 1500,
        videoId,
      })

      // 5. Download using Bun.write — zero-copy kernel I/O
      await bunDownloadFromS3(s3, creds.name, videoKey, localInputPath, videoId)
      logger.info({ event: 's3_downloaded', videoId, bytes: objMeta.contentLength })
      downloadCompletedAt = Date.now()
      currentStep = 'download'

      // 6. Verify local file integrity
      const localFile = Bun.file(localInputPath)
      if (localFile.size !== objMeta.contentLength) {
        throw new PermanentProcessingError(
          `Download integrity check failed: expected ${objMeta.contentLength} bytes, got ${localFile.size}`
        )
      }

      // 7. Extract duration
      const mediaInfo = await VideoProcessor.getMediaInfo(localInputPath)
      const duration = mediaInfo.duration

      const requestedQualities = video.qualities || ['720p']
      const s3Base = `videos/${video.userId}/${videoId}`
      const sseSupported = creds.providerType === 'aws' || creds.providerType === 'r2'
      const sseParams = sseSupported ? { ServerSideEncryption: 'AES256' as const } : {}

      // 8. HLS Adaptive Bitrate Transcoding
      currentStep = 'transcode'
      const masterPlaylistName = 'master.m3u8'
      const masterPlaylistPath = path.join(localHlsDir, masterPlaylistName)

      logger.info({
        event: 'ffmpeg_abr_start',
        videoId,
        qualities: requestedQualities,
        inputSizeMB: +(objMeta.contentLength / MB).toFixed(2),
        duration,
        memTier: memProfile.tier,
      })

      const qualityConfigs: Record<string, { width: number; height: number; b: string; max: string; buf: string }> = {
        '360p': { width: 640, height: 360, b: '800k', max: '850k', buf: '1200k' },
        '480p': { width: 854, height: 480, b: '1400k', max: '1500k', buf: '2100k' },
        '720p': { width: 1280, height: 720, b: '2800k', max: '3000k', buf: '4200k' },
        '1080p': { width: 1920, height: 1080, b: '5000k', max: '5300k', buf: '7500k' },
        '2160p': { width: 3840, height: 2160, b: '20000k', max: '21000k', buf: '30000k' },
      }

      // Limit qualities based on available RAM
      let activeQualities = Object.keys(qualityConfigs).filter(q => requestedQualities.includes(q))
      if (activeQualities.length > memProfile.maxSimultaneousQualities) {
        logger.warn({
          event: 'quality_cap_applied',
          videoId,
          requested: activeQualities.length,
          capped: memProfile.maxSimultaneousQualities,
          memTier: memProfile.tier,
        })
        activeQualities = activeQualities.slice(0, memProfile.maxSimultaneousQualities)
      }

      const hlsSegmentDuration = getHlsSegmentDuration(duration, activeQualities.length)

      // Sequential encoding: one quality per FFmpeg process (low memory mode)
      // vs simultaneous encoding: all qualities in one FFmpeg process (default)
      const sequentialEncode = activeQualities.length > 1 && memProfile.maxSimultaneousQualities <= 1

      if (sequentialEncode) {
        // Encode each quality as a separate FFmpeg process to avoid OOM
        logger.info({
          event: 'ffmpeg_encode_profile',
          videoId,
          preset: memProfile.ffmpegPreset,
          segmentDuration: hlsSegmentDuration,
          qualities: activeQualities,
          hasAudio: mediaInfo.hasAudio,
          mode: 'sequential',
        })

        for (let qi = 0; qi < activeQualities.length; qi++) {
          const q = activeQualities[qi]!
          const cfg = qualityConfigs[q]!
          const variantDir = path.join(localHlsDir, `v${qi}`)
          await fs.mkdir(variantDir, { recursive: true })

          const segPath = path.posix.join(variantDir.replace(/\\/g, '/'), 'seg-%d.ts')
          const plPath = path.posix.join(variantDir.replace(/\\/g, '/'), 'playlist.m3u8')

          const args = [
            '-y', '-i', localInputPath,
            '-preset', memProfile.ffmpegPreset,
            '-g', '48', '-sc_threshold', '0',
            '-map', '0:v:0',
            '-vf', `scale=${cfg.width}:${cfg.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1`,
            '-c:v', 'libx264',
            '-b:v', cfg.b,
            '-maxrate', cfg.max,
            '-bufsize', cfg.buf,
            '-profile:v', q === '2160p' ? 'high' : 'main',
            '-threads', String(memProfile.ffmpegThreadsPerQuality),
          ]

          if (mediaInfo.hasAudio) {
            args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', '2')
          }

          args.push(
            '-f', 'hls',
            '-hls_time', String(hlsSegmentDuration),
            '-hls_playlist_type', 'vod',
            '-hls_flags', 'independent_segments',
            '-hls_segment_filename', segPath,
            plPath
          )

          logger.info({ event: 'ffmpeg_sequential_pass', videoId, quality: q, pass: `${qi + 1}/${activeQualities.length}` })
          await VideoProcessor.runFfmpeg(args, videoId)
        }

        // Build master playlist manually
        const bandwidthMap: Record<string, number> = {
          '360p': 800000, '480p': 1400000, '720p': 2800000, '1080p': 5000000, '2160p': 20000000,
        }
        const resolutionMap: Record<string, string> = {
          '360p': '640x360', '480p': '854x480', '720p': '1280x720', '1080p': '1920x1080', '2160p': '3840x2160',
        }

        let masterLines = ['#EXTM3U', '#EXT-X-VERSION:3']
        for (let qi = 0; qi < activeQualities.length; qi++) {
          const q = activeQualities[qi]!
          const bw = bandwidthMap[q] || 1400000
          const res = resolutionMap[q] || '854x480'
          masterLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${res}`,
            `v${qi}/playlist.m3u8`
          )
        }
        await fs.writeFile(masterPlaylistPath, masterLines.join('\n') + '\n')

      } else {
        // Simultaneous encoding: all qualities in one FFmpeg process
        const ffmpegArgs = [
          '-y', // CRITICAL: Prevent FFmpeg from hanging forever asking for overwrite prompts
          '-i', localInputPath,
          '-preset', memProfile.ffmpegPreset,
          '-g', '48', '-sc_threshold', '0',
        ]

        // Map video once per quality
        activeQualities.forEach(() => {
          ffmpegArgs.push('-map', '0:v:0')
        })

        if (mediaInfo.hasAudio) {
          // Map audio exactly once for all renditions to save CPU/memory.
          ffmpegArgs.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', '-ac', '2')
        }

        // Add Video Settings per rendition — threads tuned by memory profile
        activeQualities.forEach((q, i) => {
          const cfg = qualityConfigs[q]
          if (!cfg) return
          ffmpegArgs.push(
            `-vf:v:${i}`, `scale=${cfg.width}:${cfg.height}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1`,
            `-c:v:${i}`, 'libx264',
            `-b:v:${i}`, cfg.b,
            `-maxrate:v:${i}`, cfg.max,
            `-bufsize:v:${i}`, cfg.buf,
            `-profile:v:${i}`, q === '2160p' ? 'high' : 'main',
            `-threads:v:${i}`, String(memProfile.ffmpegThreadsPerQuality)
          )
        })

        const varStreamMap = activeQualities
          .map((_q, i) => mediaInfo.hasAudio ? `v:${i},a:0` : `v:${i}`)
          .join(' ')

        // Use posix paths (forward slashes) for FFmpeg - Windows backslashes cause issues
        const segmentPath = path.posix.join(localHlsDir.replace(/\\/g, '/'), 'v%v/seg-%d.ts')
        const playlistPath = path.posix.join(localHlsDir.replace(/\\/g, '/'), 'v%v/playlist.m3u8')

        ffmpegArgs.push(
          '-f', 'hls',
          '-hls_time', String(hlsSegmentDuration),
          '-hls_playlist_type', 'vod',
          '-hls_flags', 'independent_segments',
          '-master_pl_name', masterPlaylistName,
          '-hls_segment_filename', segmentPath,
          '-var_stream_map', varStreamMap,
          playlistPath
        )

        logger.info({
          event: 'ffmpeg_encode_profile',
          videoId,
          preset: memProfile.ffmpegPreset,
          segmentDuration: hlsSegmentDuration,
          qualities: activeQualities,
          hasAudio: mediaInfo.hasAudio,
          mode: 'simultaneous',
        })

        await VideoProcessor.runFfmpeg(ffmpegArgs, videoId)
      }

      logger.info({
        event: 'ffmpeg_abr_done',
        videoId,
        qualities: activeQualities,
        duration,
        transcodeTimeMs: Date.now() - transcodeCompletedAt,
      })
      transcodeCompletedAt = Date.now()

      // Validate master playlist was actually created
      await VideoProcessor.validateOutput(masterPlaylistPath, videoId, 50)

      // 9. Parallel batch upload HLS files
      async function getFiles(dir: string): Promise<string[]> {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        const files = await Promise.all(entries.map((entry) => {
          const res = path.resolve(dir, entry.name)
          return entry.isDirectory() ? getFiles(res) : [res]
        }))
        return files.flat()
      }

      const allHlsFiles = await getFiles(localHlsDir)
      const uploadManifest = allHlsFiles.map(filePath => {
        const relativePath = path.relative(localHlsDir, filePath).replace(/\\/g, '/')
        return {
          localPath: filePath,
          key: `${s3Base}/hls/${relativePath}`,
          contentType: relativePath.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/MP2T',
        }
      })

      // 9. Split manifest: master playlist first, segments after
      currentStep = 'hls_upload'
      const masterFiles = uploadManifest.filter(f => f.key.endsWith('.m3u8'))
      const segmentFiles = uploadManifest.filter(f => !f.key.endsWith('.m3u8'))

      // Upload master + sub-playlists first so the video becomes playable ASAP
      await batchUploadToS3(s3, creds.name, masterFiles, sseParams)
      logger.info({ event: 'hls_playlists_uploaded', videoId, count: masterFiles.length })

      // Mark ready immediately — segments stream in the background
      await db.update(videos).set({
        status: 'ready',
        hlsPath: `${s3Base}/hls/master.m3u8`,
        duration,
        errorMessage: null,
        updatedAt: new Date(),
      }).where(eq(videos.id, videoId))
      logger.info({ event: 'video_ready_early', videoId, duration })

      // 10. Upload segments + thumbnail in parallel (background — video already playable)
      currentStep = 'thumbnail'
      const thumbnailTask = new Promise<void>((resolve) => {
        // Thumbnail is best-effort — never fail the video if it errors
        const timeout = setTimeout(() => {
          logger.warn({ event: 'ffmpeg_thumb_timeout', videoId })
          resolve()
        }, 30000) // Reduced to 30s

        try {
          // Seek to midpoint of video for thumbnail (min 0.5s to avoid black/corrupt first frame)
          const thumbSeekSec = Math.max(0.5, Math.min(1, duration / 2)).toFixed(2)
          ffmpeg(localInputPath)
            .inputOptions(['-ss', thumbSeekSec, '-noaccurate_seek'])
            .outputOptions(['-y', '-vframes', '1', '-vf', 'scale=640:-2', '-c:v', 'libwebp', '-quality', '75'])
            .output(localThumbPath)
            .on('end', () => { clearTimeout(timeout); thumbCompletedAt = Date.now(); logger.info({ event: 'ffmpeg_thumb_success', videoId }); resolve() })
            .on('error', (err) => { clearTimeout(timeout); logger.warn({ event: 'ffmpeg_thumb_error', videoId, msg: err.message }); resolve() })
            .run()
        } catch (err: any) {
          // Catch synchronous throws (e.g., invalid command on Windows)
          clearTimeout(timeout)
          logger.warn({ event: 'ffmpeg_thumb_sync_error', videoId, msg: err.message })
          resolve()
        }
      })

      // 11. Post-ready cleanup: segments + thumbnail + temp file (all non-critical)
      try {
        await Promise.all([
          batchUploadToS3(s3, creds.name, segmentFiles, sseParams).then(() => {
            hlsUploadCompletedAt = Date.now()
            logger.info({ event: 'hls_segments_uploaded', videoId, count: segmentFiles.length })
          }),
          thumbnailTask.then(async () => {
            const thumbExists = await Bun.file(localThumbPath).exists()
            if (!thumbExists) return
            await bunUploadToS3(s3!, creds.name, `${s3Base}/thumbnail.webp`, localThumbPath, 'image/webp', sseParams)
            await db.update(videos).set({ thumbnailPath: `${s3Base}/thumbnail.webp`, updatedAt: new Date() }).where(eq(videos.id, videoId))
            logger.info({ event: 's3_thumb_uploaded', videoId })
          }),
        ])
      } catch (postReadyErr: any) {
        // Non-critical: video is already playable, log but don't fail
        logger.warn({ event: 'post_ready_cleanup_failed', videoId, error: postReadyErr.message })
      }

      // 12. Delete temp source from S3 (only for legacy temp/ uploads)
      if (videoKey.startsWith('temp/')) {
        await s3.send(new DeleteObjectCommand({ Bucket: creds.name, Key: videoKey })).catch((e: any) => {
          logger.error({ event: 's3_temp_delete_failed', videoId, error: e.message, stack: e.stack })
        })
      }

      logger.info({
        event: 'video_ready',
        videoId,
        userId: video.userId,
        fileSizeMB: video.fileSizeBytes ? +(video.fileSizeBytes / MB).toFixed(2) : undefined,
        processingMode: video.processingMode,
        qualities: video.qualities,
        duration,
        timingsMs: {
          total: Date.now() - pipelineStartedAt,
          download: downloadCompletedAt - pipelineStartedAt,
          transcode: transcodeCompletedAt - downloadCompletedAt,
          hlsUpload: hlsUploadCompletedAt - transcodeCompletedAt,
          thumbnail: thumbCompletedAt > transcodeCompletedAt ? thumbCompletedAt - transcodeCompletedAt : 0,
        },
      })
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown processing error'
      const durationBeforeFailMs = Date.now() - pipelineStartedAt

      // Check if video was already marked ready before this error
      const currentVideo = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
      const wasAlreadyReady = currentVideo[0]?.status === 'ready'

      // If video is already ready, any error is non-critical (happened during post-ready cleanup)
      if (wasAlreadyReady) {
        logger.warn({
          event: 'thumbnail_failed_non_blocking',
          videoId,
          userId: video.userId,
          error: errorMessage,
          note: 'Video already ready, ignoring cleanup error'
        })
        return // Return successfully, don't throw
      }

      // Use explicit step tracking — timing heuristics were unreliable when
      // intermediate timestamps weren't updated (e.g. transcode failure
      // was misidentified as "thumbnail" because transcodeCompletedAt never got set).
      const failureStep = currentStep

      // Classify: permanent errors should NOT be retried by BullMQ
      const isPermanent = err instanceof PermanentProcessingError ||
        err instanceof UnrecoverableError ||
        failureStep === 'thumbnail' || // Thumbnail failures are non-critical, don't retry
        errorMessage.includes('Download integrity check failed') ||
        errorMessage.includes('FFmpeg output too small') ||
        errorMessage.includes('FFmpeg output missing') ||
        errorMessage.includes('is 0 bytes after')

      logger.error({
        event: 'video_processing_failed',
        videoId,
        userId: video.userId,
        step: failureStep,
        durationBeforeFailMs,
        errorName: err.name || 'Error',
        errorMessage,
        isPermanent,
        stack: err.stack,
      })

      if (isPermanent) {
        await db.update(videos)
          .set({
            status: 'error',
            errorMessage: 'Video processing failed - file may be corrupt or unsupported',
            updatedAt: new Date()
          })
          .where(eq(videos.id, videoId))

        if (!(err instanceof UnrecoverableError)) {
          throw new PermanentProcessingError(errorMessage)
        }
        throw err
      }

      // Transient failures should not be surfaced as final "error" state yet.
      await db.update(videos)
        .set({
          status: 'processing',
          errorMessage: 'Temporary processing issue - retrying automatically',
          updatedAt: new Date()
        })
        .where(eq(videos.id, videoId))

      throw err // Network/transient errors -> BullMQ retries
    } finally {
      // 14. Cleanup entire job directory atomically
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Cleanup stale temp files older than maxAgeMs.
   * Call this on worker boot to remove orphaned files from crashes/restarts.
   */
  static async cleanupStaleTemp(maxAgeMs: number = 60 * 60 * 1000) {
    try {
      const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true })
      const now = Date.now()
      let cleaned = 0

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const dirPath = path.join(TEMP_DIR, entry.name)

        try {
          const stat = await fs.stat(dirPath)
          const age = now - stat.mtimeMs

          if (age > maxAgeMs) {
            await fs.rm(dirPath, { recursive: true, force: true })
            cleaned++
            logger.info({ event: 'stale_temp_cleaned', dir: entry.name, ageMinutes: Math.round(age / 60000) })
          }
        } catch {
          // Skip if we can't stat it
        }
      }

      if (cleaned > 0) {
        logger.info({ event: 'stale_temp_cleanup_done', cleaned })
      }
    } catch {
      // TEMP_DIR might not exist yet — that's fine
    }
  }

  /**
   * Cleanup orphaned remote temp source objects from object storage.
   *
   * Safe targets:
   * - HLS videos already `ready` that still point to `temp/...`
   * - HLS videos in `error` older than maxErrorAgeMs
   *
   * We intentionally skip `pending`, `uploading`, and recent `error` rows so
   * BullMQ retries and delayed processing are not affected.
   */
  static async cleanupOrphanedRemoteTempSources(maxErrorAgeMs: number = 60 * 60 * 1000) {
    const errorThreshold = new Date(Date.now() - maxErrorAgeMs)

    const candidates = await db.select({
      id: videos.id,
      bucketId: videos.bucketId,
      videoUrl: videos.videoUrl,
      status: videos.status,
      updatedAt: videos.updatedAt,
    })
      .from(videos)
      .where(and(
        eq(videos.processingMode, 'hls'),
        like(videos.videoUrl, 'temp/%'),
        or(
          eq(videos.status, 'ready'),
          and(eq(videos.status, 'error'), lt(videos.updatedAt, errorThreshold))
        )
      ))

    if (candidates.length === 0) return

    let cleaned = 0

    for (const candidate of candidates) {
      if (!candidate.bucketId) continue

      let s3: S3Client | null = null
      try {
        s3 = await getCachedS3Client(candidate.bucketId)
        const creds = await storageService.getBucketCredentials(candidate.bucketId)
        await s3.send(new DeleteObjectCommand({
          Bucket: creds.name,
          Key: candidate.videoUrl,
        }))

        // Clear the temp videoUrl so this row is never picked up again
        await db.update(videos)
          .set({ videoUrl: '', updatedAt: new Date() })
          .where(eq(videos.id, candidate.id))

        cleaned++
        logger.info({
          event: 'stale_remote_temp_deleted',
          videoId: candidate.id,
          status: candidate.status,
          key: candidate.videoUrl,
        })
      } catch (err: any) {
        const code = err?.Code || err?.name || 'Unknown'
        if (code === 'NoSuchKey' || code === 'NotFound') {
          logger.info({
            event: 'stale_remote_temp_missing',
            videoId: candidate.id,
            key: candidate.videoUrl,
          })
        } else {
          logger.error({
            event: 'stale_remote_temp_delete_failed',
            videoId: candidate.id,
            key: candidate.videoUrl,
            error: err?.message || 'Unknown delete error',
          })
        }
      }
    }

    if (cleaned > 0) {
      logger.info({ event: 'stale_remote_temp_cleanup_done', cleaned })
    }
  }

  /**
   * Recover videos stuck in 'processing' state from a previous worker crash.
   * Called once on worker boot — marks them as 'error' so they can be retried.
   */
  static async recoverStuckJobs(maxAgeMs: number = 30 * 60 * 1000, shouldRequeue: boolean = false) {
    try {
      const threshold = new Date(Date.now() - maxAgeMs)
      
      const setFields = shouldRequeue
        ? {
            status: 'pending' as const,
            errorMessage: null,
            updatedAt: new Date(),
          }
        : {
            status: 'error' as const,
            errorMessage: 'Worker crashed during processing — auto-recovered on restart',
            updatedAt: new Date(),
          }

      const stuck = await db.update(videos)
        .set(setFields)
        .where(
          and(
            eq(videos.status, 'processing'),
            lt(videos.updatedAt, threshold)
          )
        )
        .returning({ id: videos.id })

      if (stuck.length > 0) {
        logger.warn({
          event: 'stuck_jobs_recovered',
          count: stuck.length,
          videoIds: stuck.map((v) => v.id),
          requeued: shouldRequeue
        })

        for (const video of stuck) {
          const videoId = video.id

          // Gap 1: Clean up BullMQ queue
          try {
            const job = await videoQueue.getJob(videoId)
            if (job) {
              const state = await job.getState()
              if (state !== 'completed') {
                await job.remove()
                logger.info({ event: 'stuck_job_bullmq_cleaned', videoId })
              }
            }
          } catch (e: any) {
             logger.error({ event: 'stuck_job_bullmq_clean_failed', videoId, error: e.message, stack: e.stack })
          }

          // Gap 2: Cleanup /tmp
          try {
            const jobDir = path.join(TEMP_DIR, videoId)
            await fs.rm(jobDir, { recursive: true, force: true })
            logger.info({ event: 'stuck_job_tmp_cleaned', videoId })
          } catch (e: any) {
            logger.error({ event: 'stuck_job_tmp_clean_failed', videoId, error: e.message, stack: e.stack })
          }

          // Gap 3: Requeue if needed
          if (shouldRequeue) {
            try {
              await videoQueue.add('process-video', { videoId }, { jobId: videoId, delay: 5000 })
              logger.info({ event: 'stuck_job_requeued', videoId })
            } catch (e: any) {
              logger.error({ event: 'stuck_job_requeue_failed', videoId, error: e.message, stack: e.stack })

              try {
                await db.update(videos)
                  .set({
                    status: 'error',
                    errorMessage: 'Requeue failed after recovery',
                    updatedAt: new Date(),
                  })
                  .where(eq(videos.id, videoId))
              } catch (rollbackErr: any) {
                logger.error({ event: 'stuck_job_requeue_rollback_failed', videoId, error: rollbackErr.message, stack: rollbackErr.stack })
              }
            }
          }
        }
      }
    } catch (err: any) {
      logger.error({ event: 'stuck_jobs_recovery_failed', error: err.message, stack: err.stack })
    }
  }

  /**
   * Cleanup videos stuck in 'uploading' state (presigned URL uploads that were never confirmed).
   * Deletes the orphaned S3 object and the DB record, releases storage quota.
   */
  static async cleanupStaleUploads(maxAgeMs: number = 2 * 60 * 60 * 1000): Promise<number> {
    const threshold = new Date(Date.now() - maxAgeMs)

    const stale = await db.select({
      id: videos.id,
      bucketId: videos.bucketId,
      videoUrl: videos.videoUrl,
      fileSizeBytes: videos.fileSizeBytes,
      userId: videos.userId,
    })
      .from(videos)
      .where(
        and(
          eq(videos.status, 'uploading'),
          lt(videos.updatedAt, threshold)
        )
      )

    let cleaned = 0
    for (const video of stale) {
      try {
        // Delete S3 object (may not exist if upload was interrupted)
        if (video.bucketId && video.videoUrl) {
          const creds = await storageService.getBucketCredentials(video.bucketId)
          const client = createS3Client(creds)
          await client.send(new DeleteObjectCommand({
            Bucket: creds.name,
            Key: video.videoUrl,
          })).catch(() => {})
          client.destroy()
        }

        // Release storage quota
        if (video.bucketId && video.fileSizeBytes && video.fileSizeBytes > 0) {
          await storageService.trackDeletion(video.bucketId, Number(video.fileSizeBytes))
        }

        // Delete DB record
        await db.delete(videos).where(eq(videos.id, video.id))
        cleaned++
        logger.info({ event: 'stale_upload_cleaned', videoId: video.id, userId: video.userId })
      } catch (err: any) {
        logger.error({ event: 'stale_upload_cleanup_failed', videoId: video.id, error: err.message })
      }
    }

    if (cleaned > 0) {
      logger.info({ event: 'stale_uploads_cleanup_done', cleaned })
    }
    return cleaned
  }

  /**
   * Lightweight asynchronous processing for MP4 mode.
   * 
   * Gets duration and thumbnail without full re-encoding.
   * Uses Bun.write for download and Bun.file for upload — zero-copy I/O.
   */
  static async lightweightProcessing(videoId: string) {
    let s3Client: S3Client | null = null
    const startedAt = Date.now()
    let video: any = null

    try {
      [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
      if (!video || !video.bucketId) throw new Error('Video not found or no bucket')

      // Queue-owned lifecycle: accept pending/uploading/error and move into processing here.
      if (video.status !== 'pending' && video.status !== 'uploading' && video.status !== 'processing' && video.status !== 'error') {
        logger.warn({ event: 'lightweight_race_skip', videoId, status: video.status })
        return
      }

      if (video.status !== 'processing') {
        await db.update(videos).set({ status: 'processing', errorMessage: null, updatedAt: new Date() }).where(eq(videos.id, videoId))
      }

      s3Client = await getCachedS3Client(video.bucketId!)

      const creds = await storageService.getBucketCredentials(video.bucketId!)
      const sseSupported = creds.providerType === 'aws' || creds.providerType === 'r2'
      const sseParams = sseSupported ? { ServerSideEncryption: 'AES256' as const } : {}

      // Wait for S3 eventual consistency BEFORE any read operations
      await waitForS3Object(s3Client, creds.name, video.videoUrl, {
        maxRetries: 6,
        baseDelayMs: 1500,
        videoId,
      })

      const s3Base = `videos/${video.userId}/${videoId}`
      const localThumbPath = path.join(TEMP_DIR, `${videoId}-thumb.webp`)
      const localMp4Path = path.join(TEMP_DIR, `${videoId}.mp4`)

      // Always download locally for ffprobe/ffmpeg — the bundled static binaries
      // crash (SIGSEGV) when accessing HTTP/presigned URLs directly.
      // Threshold set to 2GB which covers virtually all MP4 uploads.
      // Disk is cheap; reliability is not.
      let resourceUrl: string
      const useLocalFile = !video.fileSizeBytes || video.fileSizeBytes < 2 * GB

      if (useLocalFile) {
        // Download to disk — scales timeout with file size (min 2min, max 10min)
        const timeoutMs = Math.min(600_000, Math.max(120_000, (video.fileSizeBytes || 0) / MB * 500))
        await bunDownloadFromS3(s3Client, creds.name, video.videoUrl, localMp4Path, videoId, timeoutMs)
        resourceUrl = localMp4Path
        logger.info({ event: 'mp4_downloaded_for_probe', videoId, mb: +((video.fileSizeBytes || 0) / MB).toFixed(2) })
      } else {
        // Extremely large file (>2GB): fallback to presigned URL (best-effort)
        const getCmd = new GetObjectCommand({ Bucket: creds.name, Key: video.videoUrl })
        resourceUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 3600 })
      }

      // 1. Get Duration
      let duration = 0
      try {
        const { stdout } = await execFileAsync(ffprobeInstaller.path, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'csv=p=0',
          resourceUrl,
        ], { timeout: 30000 })
        duration = Math.round(parseFloat(stdout.trim())) || 0
      } catch (err: any) {
        logger.error({ event: 'lightweight_ffprobe_error', videoId, error: err.message, stack: err.stack })
        // Duration failure is non-fatal — continue to thumbnail
      }

      // 1b. Remux with movflags +faststart so moov atom is at the front (progressive playback)
      // Only applies when we have a local copy (small files). Large files skip this — not worth the I/O.
      if (useLocalFile) {
        const fastStartPath = path.join(TEMP_DIR, `${videoId}-fast.mp4`)
        try {
          await new Promise<void>((resolve, reject) => {
            ffmpeg(localMp4Path)
              .outputOptions(['-c', 'copy', '-movflags', '+faststart'])
              .output(fastStartPath)
              .on('end', () => resolve())
              .on('error', (err) => reject(err))
              .run()
          })
          // Replace original with faststart version
          await fs.rename(fastStartPath, localMp4Path)
          // Re-upload the optimized file
          await bunUploadToS3(s3Client, creds.name, video.videoUrl, localMp4Path, 'video/mp4', sseParams)
          logger.info({ event: 'mp4_faststart_applied', videoId })
        } catch (err: any) {
          logger.warn({ event: 'mp4_faststart_failed', videoId, error: err.message })
          // Non-fatal — original file is still usable
          await fs.rm(fastStartPath, { force: true }).catch(() => {})
        }
      }

      // 2. Extract Thumbnail (best-effort — non-fatal)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn({ event: 'lightweight_thumb_timeout', videoId })
          resolve()
        }, 30000) // Reduced to 30s

        try {
          // Seek to midpoint of video for thumbnail (min 0.5s to avoid black/corrupt first frame)
          const thumbSeekSec = Math.max(0.5, Math.min(1, duration / 2)).toFixed(2)
          ffmpeg(resourceUrl)
            .inputOptions(['-ss', thumbSeekSec, '-noaccurate_seek'])
            .outputOptions(['-vframes', '1', '-vf', 'scale=640:-2', '-c:v', 'libwebp', '-quality', '75'])
            .output(localThumbPath)
            .on('end', () => { clearTimeout(timeout); logger.info({ event: 'lightweight_thumb_success', videoId }); resolve() })
            .on('error', (err) => { clearTimeout(timeout); logger.warn({ event: 'lightweight_thumb_error', videoId, msg: err.message }); resolve() })
            .run()
        } catch (err: any) {
          // Catch synchronous throws (e.g., invalid command on Windows)
          clearTimeout(timeout)
          logger.warn({ event: 'lightweight_thumb_sync_error', videoId, msg: err.message })
          resolve()
        }
      })

      // 3. Upload Thumbnail (only if extraction succeeded)
      const thumbExists = await Bun.file(localThumbPath).exists()
      const thumbnailS3Key = thumbExists ? `${s3Base}/thumbnail.webp` : undefined
      if (thumbExists) {
        await bunUploadToS3(s3Client, creds.name, `${s3Base}/thumbnail.webp`, localThumbPath, 'image/webp', sseParams)
      }

      // 4. Final DB update → ready
      await db.update(videos).set({
        status: 'ready',
        duration,
        thumbnailPath: thumbnailS3Key ?? null,
        errorMessage: null,
        updatedAt: new Date(),
      }).where(eq(videos.id, videoId))

      // Unified "video_ready" event for both MP4 and HLS
      // Use processingMode field to distinguish between lightweight (mp4) and heavy (hls) processing
      logger.info({
        event: 'video_ready',
        videoId,
        userId: video.userId,
        fileSizeMB: video.fileSizeBytes ? +(video.fileSizeBytes / MB).toFixed(2) : undefined,
        processingMode: 'mp4',  // Lightweight processing
        qualities: video.qualities,
        duration,
        totalDurationMs: Date.now() - startedAt,
        timingsMs: {
          total: Date.now() - startedAt,
          thumbnail: thumbExists ? undefined : 'skipped',
        },
      })

    } catch (err: any) {
      const durationBeforeFailMs = startedAt ? Date.now() - startedAt : undefined
      logger.error({
        event: 'lightweight_processing_failed',
        videoId,
        userId: video.userId,
        step: 'lightweight',
        durationBeforeFailMs,
        error: err.message,
        stack: err.stack,
      })

      // Store safe error message in DB (don't leak internals)
      await db.update(videos).set({
        status: 'error',
        errorMessage: 'Video processing failed',
        updatedAt: new Date(),
      }).where(eq(videos.id, videoId)).catch((dbErr: any) => {
        logger.error({ event: 'lightweight_db_update_failed', videoId, error: dbErr.message, stack: dbErr.stack })
      })

      // Re-throw so the retry wrapper in video.routes.ts can catch it
      throw err
    } finally {
      // Cleanup local temp files using Bun.file().delete()
      try { await Bun.file(path.join(TEMP_DIR, `${videoId}-thumb.webp`)).delete() } catch {}
      try { await Bun.file(path.join(TEMP_DIR, `${videoId}.mp4`)).delete() } catch {}
    }
  }
}
