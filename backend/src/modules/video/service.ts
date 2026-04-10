import { db, videos, users, plans } from '../../schema'
import { eq, and, desc, isNull, or, sql } from 'drizzle-orm'
import { storageService } from '../storage'
import type { AvailableBucket } from '../storage'
import { VideoProcessor } from './processor'
import { error, errorCodes } from '../../utils/response'
import { logger } from '../../utils/logger'
import { createS3Client } from '../../utils/s3'
import { Upload } from '@aws-sdk/lib-storage'
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'
import os from 'os'
import { MB, GB } from '../../utils/constants'


// ── Constants ───────────────────────────────────────────
const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']


// Size thresholds for dynamic tuning
const SIZE_100MB = 100 * MB
const SIZE_500MB = 500 * MB
const SIZE_2GB = 2 * GB

/**
 * Adaptive upload tuning based on available RAM + file size.
 * 
 * On low-RAM VPS (1-2GB), large part sizes and high concurrency cause OOM.
 * On high-RAM workstations, small parts and low concurrency waste throughput.
 * This function balances both axes.
 */
function getUploadTuning(fileSize: number): { partSize: number; queueSize: number; highWaterMark: number } {
  const freeMem = os.freemem()
  const usable = Math.min(os.totalmem() / 2, freeMem)
  
  // RAM tier determines *ceiling* for buffer sizes
  let maxPartSize: number
  let maxQueueSize: number
  let highWaterMark: number

  if (usable < 1 * GB) {
    // Low RAM: conservative
    maxPartSize = 8 * MB
    maxQueueSize = 2
    highWaterMark = 256 * 1024 // 256KB stream buffer
  } else if (usable < 4 * GB) {
    // Medium RAM
    maxPartSize = 25 * MB
    maxQueueSize = 4
    highWaterMark = 1 * MB
  } else {
    // High RAM: aggressive throughput
    maxPartSize = 64 * MB
    maxQueueSize = 8
    highWaterMark = 4 * MB
  }

  // File-size based tuning (within RAM ceiling)
  let partSize: number
  let queueSize: number

  if (fileSize > SIZE_2GB) {
    partSize = Math.min(50 * MB, maxPartSize)
    queueSize = Math.min(8, maxQueueSize)
  } else if (fileSize > SIZE_500MB) {
    partSize = Math.min(25 * MB, maxPartSize)
    queueSize = Math.min(6, maxQueueSize)
  } else if (fileSize > SIZE_100MB) {
    partSize = Math.min(15 * MB, maxPartSize)
    queueSize = Math.min(4, maxQueueSize)
  } else {
    partSize = Math.min(10 * MB, maxPartSize)
    queueSize = Math.min(4, maxQueueSize)
  }

  return { partSize, queueSize, highWaterMark }
}

interface CreateVideoInput {
  id?: string
  userId: string
  title: string
  description?: string
  videoUrl: string
  visibility?: 'private' | 'unlisted' | 'public'
  isPrivate?: boolean
  folderId?: string | null
  fileSizeBytes: number
  processingMode?: 'mp4' | 'hls'
  qualities?: string[]
}

class VideoService {
  /**
   * Check if a user can upload a file of the given size based on their plan's storage quota.
   * Returns { allowed, usedBytes, maxBytes }.
   */
  async checkStorageQuota(userId: string, fileSizeBytes: number): Promise<{ allowed: boolean; usedBytes: number; maxBytes: number }> {
    // Get user's plan
    const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
    const planId = (user?.plan || 'free').toLowerCase()

    // Get plan storage limit (in MB, -1 = unlimited)
    const [plan] = await db.select({ maxStorage: plans.maxStorage }).from(plans).where(eq(plans.id, planId)).limit(1)
    const maxStorageMB = plan?.maxStorage ?? 2000

    // -1 means unlimited
    if (maxStorageMB === -1) {
      return { allowed: true, usedBytes: 0, maxBytes: -1 }
    }

    const maxBytes = maxStorageMB * MB

    // Sum current storage usage
    const [usage] = await db.select({
      total: sql<number>`COALESCE(SUM(${videos.fileSizeBytes}), 0)::bigint`,
    }).from(videos).where(eq(videos.userId, userId))

    const usedBytes = Number(usage?.total ?? 0)
    const allowed = (usedBytes + fileSizeBytes) <= maxBytes

    return { allowed, usedBytes, maxBytes }
  }

  /** Get videos in a specific folder, or root videos (folderId = null) */
  async getVideos(userId: string, folderId?: string, limit: number = 30, offset: number = 0) {
    try {
      const whereClause = folderId
        ? and(eq(videos.userId, userId), eq(videos.folderId, folderId))
        : and(eq(videos.userId, userId), isNull(videos.folderId))

      const [items, countResult] = await Promise.all([
        db.select()
          .from(videos)
          .where(whereClause)
          .orderBy(desc(videos.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(videos)
          .where(whereClause),
      ])

      const total = Number(countResult[0]?.count ?? 0)
      return { videos: items, total, hasMore: offset + items.length < total }
    } catch (err: any) {
      logger.error({ event: 'get_videos_failed', error: err.message || err, stack: err.stack, userId, folderId })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to fetch videos')
    }
  }

  /** Get a single video by ID */
  async getVideoById(userId: string, videoId: string) {
    try {
      const idMatch = or(eq(videos.id, videoId), eq(videos.shortId, videoId))
      const whereClause = userId === 'all_access'
        ? idMatch
        : and(idMatch, eq(videos.userId, userId))

      const [video] = await db.select()
        .from(videos)
        .where(whereClause)
        .limit(1)

      return video || null
    } catch (err: any) {
      logger.error({ event: 'get_video_failed', error: err, stack: err.stack, userId, videoId })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to fetch video record')
    }
  }

  /**
   * Allocate a storage bucket for an upload.
   */
  async allocateBucket(fileSizeBytes: number): Promise<AvailableBucket> {
    try {
      return await storageService.getAvailableBucket(fileSizeBytes)
    } catch (err: any) {
      logger.error({ event: 'allocate_bucket_failed', error: err, stack: err.stack, fileSizeBytes })
      throw err
    }
  }

  /**
   * Stream-upload a video file from backend directly to S3.
   *
   * - Frontend sends file to backend API (multipart/form-data)
   * - Backend streams it to S3 using @aws-sdk/lib-storage (multipart upload)
   * - S3 endpoint is NEVER exposed to the frontend
   * - All files encrypted with AES-256 (SSE-S3)
   *
   * Bun-optimized: Uses file.stream() (Web ReadableStream) directly with
   * AWS SDK v3 — no Readable.fromWeb() conversion needed. This eliminates
   * Node.js stream wrapper overhead and GC pressure.
   *
   * Upload tuning adapts to BOTH file size AND available system RAM so
   * it runs efficiently on a 1GB VPS and a 32GB workstation alike.
   *
   * Returns { fileKey, bucketId } on success.
   */
  async streamUploadToS3(
    userId: string,
    file: File,
    finalKey?: string,
    onProgress?: (percent: number) => void
  ): Promise<{ fileKey: string; bucketId: string }> {
    // Validation is already enforced by Elysia schema in video.routes.ts
    // (MIME type + file size). No duplicate checks needed here.
    const contentType = file.type || 'video/mp4'

    // Allocate bucket
    const bucket = await storageService.getAvailableBucket(file.size)

    const fileId = crypto.randomUUID()
    const ext = contentType === 'video/quicktime' ? 'mov' : contentType.split('/')[1] || 'mp4'
    const fileKey = finalKey || `temp/${userId}/${fileId}.${ext}`

    const client = createS3Client(bucket.credentials)

    // 4. Adaptive upload tuning (RAM-aware + file-size-aware)
    const tuning = getUploadTuning(file.size)
    const uploadStartMs = Date.now()

    try {
      // 5. Stream upload using S3 managed multipart upload
      // Bun's File.stream() returns a Web ReadableStream.
      // AWS SDK v3 accepts ReadableStream natively — no Readable.fromWeb() needed.
      // This eliminates the Node.js stream wrapper and its GC/backpressure overhead.
      const providerType = bucket.credentials.providerType
      const sseSupported = providerType === 'aws' || providerType === 'r2'

      const upload = new Upload({
        client,
        params: {
          Bucket: bucket.credentials.name,
          Key: fileKey,
          Body: file.stream(),
          ContentType: contentType,
          ...(sseSupported && { ServerSideEncryption: 'AES256' as const }),
        },
        queueSize: tuning.queueSize,
        partSize: tuning.partSize,
        leavePartsOnError: false,
      })

      upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100)
          onProgress?.(percent)
        }
      })

      await upload.done()

      const durationMs = Date.now() - uploadStartMs
      const throughputMBps = durationMs > 0 ? +((file.size / MB) / (durationMs / 1000)).toFixed(2) : 0

      logger.info({
        event: 's3_stream_upload_complete',
        userId,
        fileKey,
        bucketId: bucket.id,
        bytes: file.size,
        fileSizeMB: +(file.size / MB).toFixed(2),
        durationMs,
        throughputMBps,
        partSize: tuning.partSize,
        queueSize: tuning.queueSize,
        freeMemMB: Math.round(os.freemem() / MB),
      })

      return { fileKey, bucketId: bucket.id }
    } catch (err: any) {
      // Extract detailed error info from AWS SDK v3
      const httpStatus = err.$metadata?.httpStatusCode
      const requestId = err.$metadata?.requestId
      const errorCode = err.Code || err.name || 'Unknown'
      const errorMsg = err.message || 'No message'

      logger.error({
        event: 's3_stream_upload_failed',
        userId,
        fileKey,
        httpStatus,
        code: errorCode,
        message: errorMsg,
        requestId,
        stack: err.stack,
      })
      throw error(errorCodes.INTERNAL_ERROR, `Upload to storage failed: [HTTP ${httpStatus}] ${errorCode} — ${errorMsg}`)
    } finally {
      client.destroy()
    }
  }

  /**
   * Create a video record after successful upload.
   * Tracks storage usage on the assigned bucket.
   */
  async createVideo(input: CreateVideoInput, bucketId: string) {
    try {
      // 1. Fetch user to check plan tier
      const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1)
      if (!user) throw error(errorCodes.USER_NOT_FOUND, 'User not found')

      const plan = (user.plan || 'free').toLowerCase() as 'free' | 'creator' | 'pro'

      // 2. Enforcement Logic
      let finalMode: 'mp4' | 'hls' = input.processingMode || 'mp4'
      let finalQualities: string[] = input.qualities || ['720p']

      if (plan === 'free') {
        finalMode = 'mp4'
        finalQualities = ['720p']
      } else if (plan === 'creator') {
        const MAX_W = 1080
        // If not specified, default to ONLY 1080p to keep it lightweight (as per user request)
        finalQualities = (input.qualities || ['1080p']).filter(q => {
          const res = parseInt(q)
          return !isNaN(res) && res <= MAX_W
        })
        if (finalQualities.length === 0) finalQualities = ['720p']
      } else if (plan === 'pro') {
        // If not specified, default to ONLY 1080p for best balance of CPU and quality
        finalQualities = input.qualities || ['1080p']
        finalQualities = finalQualities.filter(q => {
          const res = parseInt(q)
          return !isNaN(res) && res <= 2160 // Up to 4K
        })
        if (finalQualities.length === 0) finalQualities = ['1080p']
      }

      const visibility = input.visibility || 'private'

      const [video] = await db.insert(videos).values({
        id: input.id || crypto.randomUUID(),
        userId: input.userId,
        title: input.title,
        description: input.description || null,
        videoUrl: input.videoUrl,
        visibility,
        isPrivate: visibility === 'private',
        folderId: input.folderId || null,
        bucketId,
        fileSizeBytes: input.fileSizeBytes,
        status: 'pending',
        processingMode: finalMode,
        qualities: finalQualities,
      }).returning()

      if (!video) throw error(errorCodes.INTERNAL_ERROR, 'Failed to create video record')

      // Log video_created immediately after DB insert
      logger.info({
        event: 'video_created',
        videoId: video.id,
        userId: video.userId,
        fileSizeMB: +(video.fileSizeBytes / MB).toFixed(2),
        plan,
        mode: finalMode,
        qualities: finalQualities,
      })

      // Track storage usage
      await storageService.trackUpload(bucketId, input.fileSizeBytes)

      // Queue all async processing so the worker is the single executor.
      await VideoProcessor.queueProcessing(video.id)

      return video
    } catch (err: any) {
      if (err.statusCode) throw err
      logger.error({ event: 'create_video_failed', error: err, stack: err.stack, input })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to finalize video record creation')
    }
  }

  /**
   * Delete a video and release its storage.
   */
  async deleteVideo(userId: string, videoId: string) {
    const video = await this.getVideoById(userId, videoId)
    if (!video) throw error(errorCodes.NOT_FOUND, 'Video not found')

    // Free storage usage tracking
    if (video.bucketId && video.fileSizeBytes && video.fileSizeBytes > 0) {
      await storageService.trackDeletion(video.bucketId, video.fileSizeBytes)
    }

    // Wipe files from actual object storage
    if (video.bucketId) {
      await storageService.deleteVideoFiles(video.bucketId, videoId, userId, video.videoUrl)
    }

    const [deleted] = await db.delete(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .returning()

    logger.info({
      event: 'video_deleted',
      videoId,
      userId,
      bucketId: video.bucketId,
      mb: +(video.fileSizeBytes / MB).toFixed(2),
      storageFreed: true,
    })
    return deleted
  }

  /**
   * Upload with failover.
   */
  async uploadWithFailover(
    fileSizeBytes: number,
    uploadFn: (bucket: AvailableBucket) => Promise<string>
  ): Promise<{ videoUrl: string; bucketId: string }> {
    const primary = await storageService.getAvailableBucket(fileSizeBytes)
    try {
      const videoUrl = await uploadFn(primary)
      return { videoUrl, bucketId: primary.id }
    } catch (primaryErr: any) {
      logger.warn({ event: 'upload_failover_primary_failed', bucketId: primary.id, error: primaryErr.message })
    }
    const fallbacks = await storageService.getFallbackBuckets(fileSizeBytes, primary.id)
    for (const fallback of fallbacks) {
      try {
        logger.info({ event: 'upload_failover_attempt', bucketId: fallback.id })
        const videoUrl = await uploadFn(fallback)
        return { videoUrl, bucketId: fallback.id }
      } catch (err: any) {
        logger.warn({ event: 'upload_failover_bucket_failed', bucketId: fallback.id, error: err.message })
      }
    }
    throw error(errorCodes.STORAGE_UPLOAD_FAILED, 'All storage buckets failed. Upload could not be completed.')
  }

  /**
   * Move a video to a different folder.
   */
  async moveVideo(userId: string, videoId: string, folderId: string | null) {
    const video = await this.getVideoById(userId, videoId)
    if (!video) throw error(errorCodes.NOT_FOUND, 'Video not found')

    const [moved] = await db.update(videos)
      .set({ folderId })
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .returning()

    return moved
  }
  /**
   * Update video record (e.g. visibility and title)
   */
  async updateVideo(userId: string, videoId: string, data: { title?: string; visibility?: string }) {
    const video = await this.getVideoById(userId, videoId)
    if (!video) throw error(errorCodes.NOT_FOUND, 'Video not found')

    const updates: any = { updatedAt: new Date() }
    if (data.title !== undefined) updates.title = data.title
    if (data.visibility !== undefined) {
      if (!['public', 'unlisted', 'private'].includes(data.visibility)) {
        throw error(errorCodes.INVALID_INPUT, 'Invalid visibility status')
      }
      updates.visibility = data.visibility
      updates.isPrivate = data.visibility === 'private'
    }

    const [updated] = await db.update(videos)
      .set(updates)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .returning()

    return updated
  }

  // ── Presigned URL Direct Upload ────────────────────────────────

  /**
   * Step 1: Prepare a presigned upload URL.
   * Backend never touches the file — browser uploads directly to S3.
   */
  async prepareUpload(
    userId: string,
    input: {
      title: string
      folderId: string | null
      visibility: 'private' | 'unlisted' | 'public'
      processingMode: 'mp4' | 'hls'
      qualities: string[]
      fileSizeBytes: number
      fileType: string
    }
  ): Promise<{ videoId: string; uploadUrl: string }> {
    const videoId = crypto.randomUUID()
    const ext = input.fileType === 'video/quicktime' ? 'mov' : (input.fileType.split('/')[1] || 'mp4')
    const fileKey = `videos/${userId}/${videoId}/original.${ext}`

    // Allocate bucket
    const bucket = await storageService.getAvailableBucket(input.fileSizeBytes)
    const client = createS3Client(bucket.credentials)

    // Ensure bucket CORS allows direct browser uploads
    await storageService.fixBucketCors(bucket.id).catch((err: any) => {
      logger.warn({ event: 'prepare_upload_cors_skip', bucketId: bucket.id, error: err.message })
    })

    try {
      // Generate presigned PUT URL (1 hour expiry)
      const command = new PutObjectCommand({
        Bucket: bucket.credentials.name,
        Key: fileKey,
        ContentType: input.fileType,
      })
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 })

      // Fetch user for plan enforcement
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!user) throw error(errorCodes.USER_NOT_FOUND, 'User not found')
      const plan = (user.plan || 'free').toLowerCase() as 'free' | 'creator' | 'pro'

      // Enforce plan limits
      let finalMode: 'mp4' | 'hls' = input.processingMode || 'mp4'
      let finalQualities: string[] = input.qualities || ['720p']

      if (plan === 'free') {
        finalMode = 'mp4'
        finalQualities = ['720p']
      } else if (plan === 'creator') {
        finalQualities = (input.qualities || ['1080p']).filter(q => {
          const res = parseInt(q)
          return !isNaN(res) && res <= 1080
        })
        if (finalQualities.length === 0) finalQualities = ['720p']
      } else if (plan === 'pro') {
        finalQualities = (input.qualities || ['1080p']).filter(q => {
          const res = parseInt(q)
          return !isNaN(res) && res <= 2160
        })
        if (finalQualities.length === 0) finalQualities = ['1080p']
      }

      const visibility = input.visibility || 'private'

      // Create video record with 'uploading' status
      await db.insert(videos).values({
        id: videoId,
        userId,
        title: input.title,
        videoUrl: fileKey,
        visibility,
        isPrivate: visibility === 'private',
        folderId: input.folderId || null,
        bucketId: bucket.id,
        fileSizeBytes: input.fileSizeBytes,
        status: 'uploading',
        processingMode: finalMode,
        qualities: finalQualities,
      })

      // Eagerly track storage quota (released on abort or cleanup if upload never completes)
      await storageService.trackUpload(bucket.id, input.fileSizeBytes)

      logger.info({
        event: 'upload_prepared',
        videoId,
        userId,
        fileKey,
        bucketId: bucket.id,
        fileSizeMB: +(input.fileSizeBytes / MB).toFixed(2),
        plan,
        mode: finalMode,
      })

      return { videoId, uploadUrl }
    } finally {
      client.destroy()
    }
  }

  /**
   * Step 2: Confirm that direct-to-S3 upload completed.
   * Verifies the S3 object exists, then queues processing.
   */
  async confirmUpload(
    userId: string,
    videoId: string
  ): Promise<{ videoId: string; status: string; processingMode: string | null; qualities: string[] | null }> {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
    if (!video || video.userId !== userId) {
      throw error(errorCodes.NOT_FOUND, 'Video not found')
    }
    if (video.status !== 'uploading') {
      throw error(errorCodes.INVALID_INPUT, 'Upload not in progress')
    }

    // Verify S3 object exists
    const creds = await storageService.getBucketCredentials(video.bucketId!)
    const client = createS3Client(creds)
    try {
      const headResult = await client.send(new HeadObjectCommand({
        Bucket: creds.name,
        Key: video.videoUrl,
      }))

      if (!headResult.ContentLength || headResult.ContentLength === 0) {
        throw error(errorCodes.INVALID_INPUT, 'Upload not completed or file is empty')
      }

      // Update status to pending (CAS: only if still 'uploading')
      const [updated] = await db.update(videos)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(and(eq(videos.id, videoId), eq(videos.status, 'uploading')))
        .returning({ id: videos.id })

      if (!updated) {
        throw error(errorCodes.INVALID_INPUT, 'Upload already confirmed or no longer in progress')
      }

      logger.info({
        event: 'upload_confirmed',
        videoId,
        userId,
        s3Size: headResult.ContentLength,
        declaredSize: video.fileSizeBytes,
      })

      // Queue processing
      await VideoProcessor.queueProcessing(videoId)

      return {
        videoId,
        status: 'pending',
        processingMode: video.processingMode,
        qualities: video.qualities,
      }
    } finally {
      client.destroy()
    }
  }

  /**
   * Abort an in-progress upload. Deletes S3 object (if any), releases quota, removes DB record.
   */
  async abortUpload(userId: string, videoId: string): Promise<void> {
    const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1)
    if (!video || video.userId !== userId) {
      throw error(errorCodes.NOT_FOUND, 'Video not found')
    }
    if (video.status !== 'uploading') {
      throw error(errorCodes.INVALID_INPUT, 'Upload not in progress')
    }

    // Delete S3 object (may not exist if upload was interrupted)
    if (video.bucketId && video.videoUrl) {
      try {
        const creds = await storageService.getBucketCredentials(video.bucketId)
        const client = createS3Client(creds)
        await client.send(new DeleteObjectCommand({
          Bucket: creds.name,
          Key: video.videoUrl,
        })).catch(() => {})
        client.destroy()
      } catch { /* best effort */ }
    }

    // Release storage quota
    if (video.bucketId && video.fileSizeBytes && video.fileSizeBytes > 0) {
      await storageService.trackDeletion(video.bucketId, video.fileSizeBytes)
    }

    // Delete DB record
    await db.delete(videos).where(eq(videos.id, videoId))

    logger.info({ event: 'upload_aborted', videoId, userId })
  }
}

export const videoService = new VideoService()
