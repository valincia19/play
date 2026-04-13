import { Elysia, t } from 'elysia'
import { createHash } from 'crypto'
import { videoService } from './service'
import { verifyStreamSignature, signPlaylist, generateStreamSignature } from '../../utils/streaming'
import { storageService } from '../storage'
import { env } from '../../config/env'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { createS3Client } from '../../utils/s3'
import { rateLimit } from 'elysia-rate-limit'
import { error, errorCodes } from '../../utils/response'
import { logger } from '../../utils/logger'
import { checkBandwidthQuota, trackBandwidth } from '../../utils/bandwidth'
import path from 'path'
import { db, adSettings, trackingEvents, videos } from '../../schema'
import { eq, and, sql } from 'drizzle-orm'
import type { S3Client } from '@aws-sdk/client-s3'
import { redisManager } from '../../utils/redis'

// ── Per-bucket S3 client cache ───────────────────────────────────
const s3ClientCache = new Map<string, S3Client>()

async function getS3ClientForBucket(bucketId: string): Promise<{ client: S3Client; creds: any }> {
  const creds = await storageService.getBucketCredentials(bucketId)
  const cached = s3ClientCache.get(bucketId)
  if (cached) return { client: cached, creds }
  const client = createS3Client(creds)
  s3ClientCache.set(bucketId, client)
  return { client, creds }
}

function generateViewerFingerprint(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown'
  const ua = request.headers.get('user-agent') || 'unknown'
  return createHash('sha256').update(`${ip}::${ua}`).digest('hex').substring(0, 32)
}

const TRACK_RATE_LIMIT = 15
const TRACK_RATE_WINDOW = 60_000
const trackRateMap = new Map<string, { count: number; resetAt: number }>()

setInterval(() => {
  const now = Date.now()
  for (const [key, val] of trackRateMap) {
    if (now > val.resetAt) trackRateMap.delete(key)
  }
}, 5 * 60_000)

function isTrackRateLimited(request: Request): boolean {
  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('cf-connecting-ip')
    || 'anon'
  const key = `track:${ip}`
  const now = Date.now()
  const entry = trackRateMap.get(key)
  if (!entry || now > entry.resetAt) {
    trackRateMap.set(key, { count: 1, resetAt: now + TRACK_RATE_WINDOW })
    return false
  }
  entry.count++
  return entry.count > TRACK_RATE_LIMIT
}

export const videoStreamingRoutes = new Elysia({ prefix: '/v' })
  .use(rateLimit({
    duration: 60000,
    max: 500,
    generator: (req) => req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'anon'
  }))
  .get('/:id/metadata', async ({ params }) => {
    const video = await videoService.getVideoById('all_access', params.id)
    if (!video) throw error(errorCodes.NOT_FOUND, 'Video not found')
    if (video.visibility === 'private' || video.isPrivate) {
      throw error(errorCodes.NOT_FOUND, 'Video is private or unavailable')
    }
    const expiry = Math.floor(Date.now() / 1000) + 3600 * 2
    const context = 'public_share'
    const signature = generateStreamSignature(video.id, expiry, context)
    const userAds = await db.select().from(adSettings).where(
      and(eq(adSettings.userId, video.userId), eq(adSettings.isActive, true))
    )
    return {
      success: true,
      data: {
        id: video.id,
        shortId: video.shortId,
        title: video.title,
        duration: video.duration,
        fileSizeBytes: video.fileSizeBytes,
        status: video.status,
        processingMode: video.processingMode,
        createdAt: video.createdAt,
        streamUrl: `/v/${video.id}?token=${signature}&expires=${expiry}&context=${context}`,
        ads: userAds
      }
    }
  }, { params: t.Object({ id: t.String() }) })
  .post('/:id/track', async ({ params, body, request }) => {
    if (isTrackRateLimited(request)) return { success: true }
    try {
      const redis = await redisManager.getClient()
      const fingerprint = generateViewerFingerprint(request)
      const videoId = params.id
      if (body.eventType === 'view') {
        const dedupKey = `vid:viewed:${videoId}:${fingerprint}`
        const alreadyViewed = await redis.get(dedupKey)
        if (!alreadyViewed) {
          await redis.set(dedupKey, '1', 'EX', 86400)
          const ua = request.headers.get('user-agent') || ''
          const country = request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || 'Unknown'
          const device = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? 'Mobile' : 'Desktop'
          let browser = 'Unknown'
          if (/Chrome/i.test(ua)) browser = 'Chrome'
          else if (/Safari/i.test(ua)) browser = 'Safari'
          else if (/Firefox/i.test(ua)) browser = 'Firefox'
          else if (/Edge/i.test(ua)) browser = 'Edge'
          await Promise.all([
            redisManager.rpush('queue:views', [{ videoId }]),
            redisManager.rpush('queue:tracking', [{
              videoId, eventType: 'view', sessionId: body.sessionId, viewerFingerprint: fingerprint, metadata: { country, device, browser }
            }])
          ])
        }
      } else if (body.eventType === 'ad_impression') {
        await redisManager.rpush('queue:tracking', [{
          videoId, eventType: 'ad_impression', sessionId: body.sessionId, viewerFingerprint: fingerprint, metadata: body.metadata || null
        }])
      } else if (body.eventType === 'watch_progress') {
        await redisManager.rpush('queue:tracking', [{
          videoId, eventType: 'watch_progress', sessionId: body.sessionId, viewerFingerprint: fingerprint, metadata: body.metadata || null
        }])
      }
      return { success: true }
    } catch (err: any) {
      logger.error({ event: 'tracking_ingest_failed', error: err.message, videoId: params.id })
      return { success: false }
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      eventType: t.Union([t.Literal('view'), t.Literal('ad_impression'), t.Literal('watch_progress')]),
      sessionId: t.String({ maxLength: 64 }),
      metadata: t.Optional(t.Any())
    })
  })
  .get('/:id', async ({ params, query, request, set }) => {
    const { id } = params
    try {
      const referer = request.headers.get('referer')
      const origin = request.headers.get('origin')
      const fetchMode = request.headers.get('sec-fetch-mode')
      const allowedOrigins = [env.frontendUrl]
      if (env.shareDomain) allowedOrigins.push(`https://${env.shareDomain}`)
      const isFromAllowed = allowedOrigins.some(o => referer?.startsWith(o) || origin?.startsWith(o))
      if (!isFromAllowed && fetchMode === 'navigate') {
        throw error(errorCodes.INVALID_TOKEN, 'Unauthorized access')
      }
      if (!query.token || !query.expires || !verifyStreamSignature(id, parseInt(query.expires), query.token, query.context)) {
        throw error(errorCodes.INVALID_TOKEN, 'Stream session expired or invalid')
      }
      const video = await videoService.getVideoById('all_access', id)
      if (!video || !video.bucketId) throw error(errorCodes.NOT_FOUND, 'Video not found')
      if ((video.visibility === 'private' || video.isPrivate) && query.context === 'public_share') {
        throw error(errorCodes.INVALID_TOKEN, 'This video is private and cannot be viewed via public links')
      }
      if (!video.hlsPath || video.processingMode === 'mp4') {
        const range = request.headers.get('range')
        if (!video.videoUrl) {
          logger.error({ event: 'stream_missing_video_url', videoId: id, status: video.status })
          throw error(errorCodes.NOT_FOUND, 'Video file is not available yet')
        }
        if (video.videoUrl.startsWith('http')) {
          const proxyRes = await fetch(video.videoUrl, { headers: range ? { range } : {} })
          const contentLengthStr = proxyRes.headers.get('content-length')
          const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : 0
          if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
            throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded.')
          }
          set.status = proxyRes.status
          if (proxyRes.headers.get('content-range')) set.headers['Content-Range'] = proxyRes.headers.get('content-range') as string
          if (proxyRes.headers.get('accept-ranges')) set.headers['Accept-Ranges'] = proxyRes.headers.get('accept-ranges') as string
          set.headers['Content-Type'] = proxyRes.headers.get('content-type') || 'video/mp4'
          if (contentLengthStr) set.headers['Content-Length'] = contentLengthStr
          if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})
          return proxyRes.body as any
        } else {
          const { client, creds } = await getS3ClientForBucket(video.bucketId)
          const s3Response = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: video.videoUrl, Range: range || undefined }))
          const contentLength = s3Response.ContentLength ?? 0
          if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
            throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded.')
          }
          set.status = s3Response.$metadata.httpStatusCode || 200
          if (s3Response.ContentRange) set.headers['Content-Range'] = s3Response.ContentRange
          if (s3Response.AcceptRanges) set.headers['Accept-Ranges'] = s3Response.AcceptRanges
          set.headers['Content-Type'] = s3Response.ContentType || 'video/mp4'
          if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()
          if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})
          return s3Response.Body as any
        }
      }
      const host = request.headers.get('host')
      const protocol = host?.includes('localhost') ? 'http' : 'https'
      let tokenParams = `token=${query.token}&expires=${query.expires}`
      if (query.context) tokenParams += `&context=${query.context}`
      set.status = 302
      set.headers['Location'] = `${protocol}://${host}/v/${id}/${path.basename(video.hlsPath)}?${tokenParams}`
      return
    } catch (err: any) {
      // Re-throw structured API errors (they already have statusCode)
      if (err?.success === false || err?.statusCode) throw err
      logger.error({ event: 'stream_handler_crash', videoId: id, error: err?.message, stack: err?.stack })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to stream video')
    }
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ token: t.String(), expires: t.String(), context: t.Optional(t.String()) })
  })
  .get('/:id/*', async ({ params, query, request, set }) => {
    const { id, '*': internalPath } = params
    try {
      const referer = request.headers.get('referer')
      const origin = request.headers.get('origin')
      const fetchMode = request.headers.get('sec-fetch-mode')
      const allowedOrigins = [env.frontendUrl]
      if (env.shareDomain) allowedOrigins.push(`https://${env.shareDomain}`)
      const isFromAllowed = allowedOrigins.some(o => referer?.startsWith(o) || origin?.startsWith(o))
      if (!isFromAllowed && fetchMode === 'navigate') {
        throw error(errorCodes.INVALID_TOKEN, 'Unauthorized access')
      }
      if (!query.token || !query.expires || !verifyStreamSignature(id, parseInt(query.expires), query.token, query.context)) {
        throw error(errorCodes.INVALID_TOKEN, 'Stream session expired or invalid')
      }
      const video = await videoService.getVideoById('all_access', id)
      if (!video || !video.bucketId) throw error(errorCodes.NOT_FOUND, 'Video not found')
      if ((video.visibility === 'private' || video.isPrivate) && query.context === 'public_share') {
        throw error(errorCodes.INVALID_TOKEN, 'This video is private and cannot be viewed via public links')
      }
      if (!video.hlsPath || video.processingMode === 'mp4') {
        if (!video.videoUrl) {
          logger.error({ event: 'stream_missing_video_url', videoId: id, status: video.status })
          throw error(errorCodes.NOT_FOUND, 'Video file is not available yet')
        }
        const { client, creds } = await getS3ClientForBucket(video.bucketId)
        const range = request.headers.get('range')
        const s3Response = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: video.videoUrl, Range: range || undefined }))
        const contentLength = s3Response.ContentLength ?? 0
        if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
          throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded.')
        }
        set.status = s3Response.$metadata.httpStatusCode || 200
        if (s3Response.ContentRange) set.headers['Content-Range'] = s3Response.ContentRange
        if (s3Response.AcceptRanges) set.headers['Accept-Ranges'] = s3Response.AcceptRanges
        set.headers['Content-Type'] = s3Response.ContentType || 'video/mp4'
        if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()
        if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})
        return s3Response.Body as any
      }
      const { client, creds } = await getS3ClientForBucket(video.bucketId)
      const normalizedHlsPath = (video.hlsPath || '').replace(/\\/g, '/')
      const lastSlashIndex = normalizedHlsPath.lastIndexOf('/')
      const hlsDir = lastSlashIndex !== -1 ? normalizedHlsPath.substring(0, lastSlashIndex) : ''
      const targetFile = internalPath || normalizedHlsPath.split('/').pop() || ''
      const s3Key = hlsDir ? `${hlsDir}/${targetFile}` : targetFile
      if (targetFile.endsWith('.ts')) {
        const s3Response = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: s3Key }))
        const contentLength = s3Response.ContentLength ?? 0
        if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
          throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded.')
        }
        set.status = s3Response.$metadata.httpStatusCode || 200
        set.headers['Content-Type'] = s3Response.ContentType || 'video/MP2T'
        if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()
        set.headers['Cache-Control'] = 'public, max-age=3600'
        if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})
        return s3Response.Body as any
      }
      const data = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: s3Key }))
      const content = await data.Body?.transformToString()
      if (!content) throw error(errorCodes.NOT_FOUND, 'Empty playlist')
      const host = request.headers.get('host')
      const protocol = host?.includes('localhost') ? 'http' : 'https'
      let proxyPath = `/v/${id}`
      if (internalPath && internalPath.includes('/')) {
        const pathParts = internalPath.split('/')
        pathParts.pop()
        proxyPath += `/${pathParts.join('/')}`
      }
      const baseUrl = `${protocol}://${host}${proxyPath}`
      let tokenParams = `token=${query.token}&expires=${query.expires}`
      if (query.context) tokenParams += `&context=${query.context}`
      const signedContent = signPlaylist(content, id, baseUrl, tokenParams)
      set.headers['Content-Type'] = 'application/x-mpegURL'
      set.headers['Cache-Control'] = 'no-cache'
      return signedContent
    } catch (err: any) {
      if (err?.success === false || err?.statusCode) throw err
      logger.error({ event: 'stream_wildcard_crash', videoId: id, path: internalPath, error: err?.message, stack: err?.stack })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to stream asset')
    }
  }, {
    params: t.Object({ id: t.String(), '*': t.String() }),
    query: t.Object({ token: t.String(), expires: t.String(), context: t.Optional(t.String()) })
  })
  .get('/:id/thumbnail', async ({ params: { id }, set }) => {
    const video = await videoService.getVideoById('all_access', id)
    if (!video || !video.thumbnailPath || !video.bucketId) throw error(errorCodes.NOT_FOUND, 'Thumbnail missing')
    const { client, creds } = await getS3ClientForBucket(video.bucketId)
    const data = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: video.thumbnailPath }))
    set.headers['Content-Type'] = 'image/webp'
    set.headers['Cache-Control'] = 'public, max-age=86400'
    return data.Body
  }, { params: t.Object({ id: t.String() }) })
