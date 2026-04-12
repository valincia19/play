import { createHash } from 'crypto'
import { Elysia, t } from 'elysia'
import { enforceAuthenticatedContext, resolveAuthenticatedContext } from '../auth'
import { error, errorCodes, success } from '../../utils/response'
import { MAX_UPLOAD_SIZE } from '../../utils/constants'
import { generateStreamSignature } from '../../utils/streaming'
import { logger } from '../../utils/logger'
import { getBandwidthUsage } from '../../utils/bandwidth'
import { videoQueue } from './processor'
import { videoService } from './service'
import { db, users, videos } from '../../schema'
import { eq } from 'drizzle-orm'

const ALLOWED_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']

// ── Per-user concurrent upload limiter ──────────────────────────
// Plan-based: Free=1, Creator=3, Pro=unlimited
const UPLOAD_LIMITS: Record<string, number> = { free: 1, creator: 3, pro: Infinity }
const activeUploads = new Map<string, number>()

function getMaxConcurrentUploads(plan: string): number {
  return UPLOAD_LIMITS[plan.toLowerCase()] ?? 1
}

async function acquireUploadSlot(userId: string): Promise<boolean> {
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
  const max = getMaxConcurrentUploads(user?.plan || 'free')
  if (max === Infinity) return true
  const current = activeUploads.get(userId) ?? 0
  if (current >= max) return false
  activeUploads.set(userId, current + 1)
  return true
}

function releaseUploadSlot(userId: string): void {
  const current = activeUploads.get(userId) ?? 1
  const next = current - 1
  if (next <= 0) activeUploads.delete(userId)
  else activeUploads.set(userId, next)
}

export const videoRoutes = new Elysia({ prefix: '/videos' })
  .resolve(resolveAuthenticatedContext)
  .onBeforeHandle(enforceAuthenticatedContext)

  // GET /videos/queue-status — Get current processing queue position
  .get('/queue-status', async () => {
    const waiting = await videoQueue.getWaiting()
    const active = await videoQueue.getActive()

    return {
      queue: {
        waiting: waiting.length,
        processing: active.length,
      },
      message: active.length > 0
        ? `${waiting.length} videos waiting in queue, ${active.length} currently processing`
        : `${waiting.length} videos waiting in queue`,
    }
  })

  // GET /videos/storage-usage — get user's current storage usage vs plan limit
  .get('/storage-usage', async ({ userId }) => {
    const quota = await videoService.checkStorageQuota(userId!, 0)
    return success({
      usedBytes: quota.usedBytes,
      maxBytes: quota.maxBytes,
      usedMB: Math.round(quota.usedBytes / (1024 * 1024)),
      maxMB: quota.maxBytes === -1 ? -1 : Math.round(quota.maxBytes / (1024 * 1024)),
    })
  })

  // GET /videos/bandwidth-usage — get user's current weekly bandwidth usage vs plan limit
  .get('/bandwidth-usage', async ({ userId }) => {
    const usage = await getBandwidthUsage(userId!)
    return success(usage)
  })

  // ── Presigned URL Direct Upload ────────────────────────────────

  // POST /videos/prepare-upload — Step 1: get presigned URL (backend never touches file)
  .post('/prepare-upload', async ({ userId, body }) => {
    if (!ALLOWED_MIME_TYPES.includes(body.fileType)) {
      return error(errorCodes.INVALID_INPUT, 'Unsupported file type')
    }

    // Check storage quota
    const quota = await videoService.checkStorageQuota(userId!, body.fileSizeBytes)
    if (!quota.allowed) {
      const usedMB = Math.round(quota.usedBytes / (1024 * 1024))
      const maxMB = Math.round(quota.maxBytes / (1024 * 1024))
      return error(errorCodes.RATE_LIMIT_EXCEEDED, `Storage quota exceeded. Used ${usedMB}MB of ${maxMB}MB. Upgrade your plan for more storage.`)
    }

    if (!await acquireUploadSlot(userId!)) {
      const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId!)).limit(1)
      const max = getMaxConcurrentUploads(user?.plan || 'free')
      return error(errorCodes.RATE_LIMIT_EXCEEDED, `Max ${max} concurrent uploads allowed for your plan`)
    }

    try {
      const result = await videoService.prepareUpload(userId!, {
        title: body.title || 'Untitled',
        folderId: body.folderId || null,
        visibility: (body.visibility || 'private') as 'private' | 'unlisted' | 'public',
        processingMode: (body.processingMode || 'mp4') as 'mp4' | 'hls',
        qualities: body.qualities || ['720p'],
        fileSizeBytes: body.fileSizeBytes,
        fileType: body.fileType,
      })
      return success(result)
    } finally {
      releaseUploadSlot(userId!)
    }
  }, {
    body: t.Object({
      title: t.Optional(t.String()),
      folderId: t.Optional(t.Nullable(t.String())),
      visibility: t.Optional(t.String()),
      processingMode: t.Optional(t.Union([t.Literal('mp4'), t.Literal('hls')])),
      qualities: t.Optional(t.Array(t.String())),
      fileSizeBytes: t.Number(),
      fileType: t.String(),
    }),
  })

  // GET /videos — list videos in a folder (or root) with pagination
  .get('/', async ({ userId, query }) => {
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100)
    const offset = Math.max(Number(query.offset) || 0, 0)
    const result = await videoService.getVideos(userId!, query.folderId, limit, offset)

    // Hash userId agar tidak terekspos plain-text di public streaming URL
    const hashedContext = createHash('sha256').update(userId!).digest('hex')

    // Inject secure stream URLs dynamically
    const videos = result.videos.map((v) => {
      const expiry = Math.floor(Date.now() / 1000) + 3600 // 1-hour session
      const signature = generateStreamSignature(v.id, expiry, hashedContext)
      return {
        ...v,
        streamUrl: `/v/${v.id}?token=${signature}&expires=${expiry}&context=${hashedContext}`,
      }
    })

    return success({ videos, total: result.total, hasMore: result.hasMore })
  }, {
    query: t.Object({
      folderId: t.Optional(t.String()),
      limit: t.Optional(t.Numeric()),
      offset: t.Optional(t.Numeric()),
    }),
  })

  // GET /videos/:id — get a single video (used for status polling)
  .get('/:id', async ({ userId, params }) => {
    const video = await videoService.getVideoById(userId!, params.id)
    if (!video) {
      return error(errorCodes.NOT_FOUND, 'Video not found')
    }
    const expiry = Math.floor(Date.now() / 1000) + 3600
    const hashedContext = createHash('sha256').update(userId!).digest('hex')
    const signature = generateStreamSignature(video.id, expiry, hashedContext)
    return success({
      video: {
        ...video,
        streamUrl: `/v/${video.id}?token=${signature}&expires=${expiry}&context=${hashedContext}`,
      },
    })
  }, {
    params: t.Object({ id: t.String() }),
  })

  // POST /videos/:id/confirm-upload — Step 2: verify S3 object exists, queue processing
  .post('/:id/confirm-upload', async ({ userId, params }) => {
    try {
      const result = await videoService.confirmUpload(userId!, params.id)
      return success(result)
    } catch (err: any) {
      if (err.statusCode) return err
      logger.error({ event: 'confirm_upload_failed', videoId: params.id, error: err.message })
      return error(errorCodes.INTERNAL_ERROR, 'Failed to confirm upload')
    }
  }, {
    params: t.Object({ id: t.String() }),
  })

  // POST /videos/:id/abort-upload — Cancel upload, clean up S3 + DB
  .post('/:id/abort-upload', async ({ userId, params }) => {
    try {
      await videoService.abortUpload(userId!, params.id)
      return success({ message: 'Upload aborted' })
    } catch (err: any) {
      if (err.statusCode) return err
      logger.error({ event: 'abort_upload_failed', videoId: params.id, error: err.message })
      return error(errorCodes.INTERNAL_ERROR, 'Failed to abort upload')
    }
  }, {
    params: t.Object({ id: t.String() }),
  })

  /**
   * POST /videos/upload — Upload video through backend (S3 hidden from frontend)
   *
   * Accepts multipart/form-data with:
   *   - file: video file (mp4/webm/mov/mkv, max 5GB)
   *   - title: video title string
   *   - folderId: optional folder ID
   *   - isPrivate: optional boolean
   *
   * Flow:
   *   1. Validates file type and size
   *   2. Streams file to S3 with AES-256 encryption
   *   3. Creates video DB record
   *   4. Enqueues processing job
   *   5. Returns videoId + status
   */
  .post('/upload', async ({ userId, body }) => {
    const { file, title, folderId } = body
    const videoId = crypto.randomUUID()

    // Check storage quota
    const quota = await videoService.checkStorageQuota(userId!, file.size)
    if (!quota.allowed) {
      const usedMB = Math.round(quota.usedBytes / (1024 * 1024))
      const maxMB = Math.round(quota.maxBytes / (1024 * 1024))
      return error(errorCodes.RATE_LIMIT_EXCEEDED, `Storage quota exceeded. Used ${usedMB}MB of ${maxMB}MB. Upgrade your plan for more storage.`)
    }

    // Enforce per-user concurrent upload limit
    if (!await acquireUploadSlot(userId!)) {
      const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId!)).limit(1)
      const max = getMaxConcurrentUploads(user?.plan || 'free')
      return error(errorCodes.RATE_LIMIT_EXCEEDED, `Max ${max} concurrent uploads allowed for your plan`)
    }

    try {
      const processingMode = body.processingMode || 'mp4'
      const rawQualities = body.qualities
      const MAX_HLS_QUALITIES = 2

      let qualities = rawQualities
        ? (Array.isArray(rawQualities) ? rawQualities : rawQualities.split(',').map((q: string) => q.trim()))
        : ['720p']

      if (processingMode === 'hls' && qualities.length > MAX_HLS_QUALITIES) {
        const quality720 = qualities.find((q: string) => q === '720p')
        const others = qualities.filter((q: string) => q !== '720p').slice(0, MAX_HLS_QUALITIES - 1)
        qualities = quality720 ? [quality720, ...others] : qualities.slice(0, MAX_HLS_QUALITIES)
        logger.warn({ event: 'hls_qualities_limited', userId, videoId, original: rawQualities, limited: qualities })
      }

      const ext = file.type === 'video/quicktime' ? 'mov' : (file.type.split('/')[1] || 'mp4')
      const fileKey = processingMode === 'mp4'
        ? `videos/${userId}/${videoId}/original.${ext}`
        : `temp/${userId}/${videoId}.${ext}`

      const { bucketId } = await videoService.streamUploadToS3(userId!, file, fileKey)

      const visibility = (body.visibility || 'private') as 'private' | 'unlisted' | 'public'

      const video = await videoService.createVideo({
        id: videoId,
        userId: userId!,
        title: title || file.name.replace(/\.[^/.]+$/, ''),
        videoUrl: fileKey,
        fileSizeBytes: file.size,
        folderId: folderId || null,
        visibility,
        isPrivate: visibility === 'private',
        processingMode,
        qualities,
      }, bucketId)

      return success({
        videoId: video.id,
        status: video.status,
        processingMode: video.processingMode,
        qualities: video.qualities,
      })
    } finally {
      releaseUploadSlot(userId!)
    }
  }, {
    body: t.Object({
      file: t.File({
        maxSize: MAX_UPLOAD_SIZE,
        type: ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'],
      }),
      title: t.Optional(t.String()),
      folderId: t.Optional(t.String()),
      visibility: t.Optional(t.String()),
      processingMode: t.Optional(t.Union([t.Literal('mp4'), t.Literal('hls')])),
      qualities: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    }),
  })

  /**
   * POST /videos/import — Import a remote video via URL (Leecher)
   */
  .post('/import', async ({ userId, body }) => {
    const { url, title, folderId } = body
    const videoId = crypto.randomUUID()

    try {
      // 1. Send HEAD request to remote URL to validate size and type
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 10000)
      
      let res: Response;
      try {
        res = await fetch(url, { method: 'HEAD', signal: abort.signal as any })
      } catch (err) {
        return error(errorCodes.INVALID_INPUT, 'Failed to fetch the remote URL. Check the URL and try again.')
      } finally {
        clearTimeout(timeout)
      }

      if (!res.ok) {
        return error(errorCodes.INVALID_INPUT, `Remote server returned HTTP ${res.status}`)
      }

      const contentType = res.headers.get('content-type') || ''
      
      // Let's just blindly accept if it claims to be video or application/octet-stream
      if (!contentType.includes('video/') && !contentType.includes('application/octet-stream') && !contentType.includes('binary')) {
         logger.warn({ event: 'import_suspicious_content_type', url, contentType })
      }

      const sizeStr = res.headers.get('content-length')
      if (!sizeStr) {
        return error(errorCodes.INVALID_INPUT, 'Remote server did not return Content-Length, cannot determine file size.')
      }

      const fileSizeBytes = parseInt(sizeStr, 10)
      if (fileSizeBytes > MAX_UPLOAD_SIZE) {
        // Technically for proxy it doesn't matter, but let's prevent crazy things
        logger.warn({ event: 'import_large_remote_file', url, sizeMB: Math.round(fileSizeBytes/1024/1024) })
      }

      // 2. Storage Quota is skipped since we aren't hosting the MP4 in S3,
      // but we still allocate a bucket for storing the Thumbnail!
      const bucket = await videoService.allocateBucket(1024 * 1024) // just 1MB estimation for thumbnail
      const processingMode = 'mp4' // Force MP4 mode for remote proxy streams
      
      const fileKey = url // Save the exact URL in the DB

      const visibility = (body.visibility || 'private') as 'private' | 'unlisted' | 'public'

      const video = await videoService.createVideo({
        id: videoId,
        userId: userId!,
        title: title || (url.split('/').pop()?.split('?')[0] || 'Imported Video'),
        videoUrl: fileKey,
        fileSizeBytes, // We save the size for analytics/bandwidth calculation 
        folderId: folderId || null,
        visibility,
        isPrivate: visibility === 'private',
        processingMode,
        qualities: ['proxy'], // special flag or just standard
        skipQueue: true,
      }, bucket.id)

      // 4. Update status to uploading immediately
      await db.update(videos).set({ status: 'uploading' }).where(eq(videos.id, videoId))

      // 5. Add to queue
      await videoQueue.add('import-video', { videoId, remoteUrl: url }, { jobId: videoId, removeOnComplete: true })

      return success({
        videoId: video.id,
        status: 'uploading',
        processingMode: video.processingMode,
        qualities: video.qualities,
        fileSizeBytes: video.fileSizeBytes, // Pass back the detected size
      })

    } catch (err: any) {
      logger.error({ event: 'import_prepare_failed', userId, error: err.message, stack: err.stack })
      return error(errorCodes.INTERNAL_ERROR, 'Failed to import video')
    }
  }, {
    body: t.Object({
      url: t.String({ format: 'uri' }),
      title: t.Optional(t.String()),
      folderId: t.Optional(t.Nullable(t.String())),
      visibility: t.Optional(t.String()),
      processingMode: t.Optional(t.Union([t.Literal('mp4'), t.Literal('hls')])),
      qualities: t.Optional(t.Union([t.String(), t.Array(t.String())])),
    }),
  })

  // POST /videos/allocate — find a bucket for a new upload (Legacy mode)
  .post('/allocate', async ({ body }) => {
    const bucket = await videoService.allocateBucket(body.fileSizeBytes)
    return success({
      bucketId: bucket.id,
      credentials: {
        name: bucket.credentials.name,
        region: bucket.credentials.region,
        endpoint: bucket.credentials.endpoint,
        providerType: bucket.credentials.providerType,
      },
    })
  }, {
    body: t.Object({
      fileSizeBytes: t.Number(),
    }),
  })

  // PATCH /videos/:id/move — move video to a new folder
  .patch('/:id/move', async ({ userId, params, body }) => {
    const video = await videoService.moveVideo(userId!, params.id, body.folderId)
    return success({ video })
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ folderId: t.Nullable(t.String()) }),
  })

  // PATCH /videos/:id — update video properties
  .patch('/:id', async ({ userId, params, body }) => {
    const video = await videoService.updateVideo(userId!, params.id, body)
    return success({ video })
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      title: t.Optional(t.String()),
      visibility: t.Optional(t.String()),
    }),
  })

  // DELETE /videos/:id — delete video and release storage
  .delete('/:id', async ({ userId, params }) => {
    const video = await videoService.deleteVideo(userId!, params.id)
    return success({ video })
  })
