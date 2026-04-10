import { Elysia, t } from 'elysia'
import { createHash } from 'crypto'
import { videoService } from './service'
import { verifyStreamSignature, signPlaylist, generateStreamSignature } from '../../utils/streaming'
import { storageService } from '../storage'
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

// ── Per-bucket S3 client cache ───────────────────────────────────
// Reusing clients avoids TCP connection churn on every segment request.
// Each bucket gets one long-lived client; destroyed only on process exit.
const s3ClientCache = new Map<string, S3Client>()

async function getS3ClientForBucket(bucketId: string): Promise<{ client: S3Client; creds: any }> {
  const creds = await storageService.getBucketCredentials(bucketId)
  const cached = s3ClientCache.get(bucketId)
  if (cached) return { client: cached, creds }
  const client = createS3Client(creds)
  s3ClientCache.set(bucketId, client)
  return { client, creds }
}

/**
 * Generate a stable viewer fingerprint from IP + User-Agent.
 * This prevents view inflation via incognito/localStorage clearing.
 */
function generateViewerFingerprint(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')
    || request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown'
  const ua = request.headers.get('user-agent') || 'unknown'
  return createHash('sha256').update(`${ip}::${ua}`).digest('hex').substring(0, 32)
}

/**
 * Lightweight in-memory rate limiter for /track endpoint.
 * Prevents spam without depending on Redis or external plugins.
 * Uses a sliding window counter per IP with auto-cleanup.
 */
const TRACK_RATE_LIMIT = 15 // max events per window
const TRACK_RATE_WINDOW = 60_000 // 1 minute
const trackRateMap = new Map<string, { count: number; resetAt: number }>()

// Cleanup stale entries every 5 minutes to prevent memory leak
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
    max: 500, // Higher limit for ABR sub-playlist fetching
    generator: (req) => req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'anon'
  }))
  /**
   * Public metadata endpoint for share pages
   */
  .get('/:id/metadata', async ({ params }) => {
    const video = await videoService.getVideoById('all_access', params.id)
    if (!video) throw error(errorCodes.NOT_FOUND, 'Video not found')

    // Enforce Visibility
    if (video.visibility === 'private' || video.isPrivate) {
      throw error(errorCodes.NOT_FOUND, 'Video is private or unavailable')
    }

    // For streamUrl, we generate a short-lived public signature.
    const expiry = Math.floor(Date.now() / 1000) + 3600 * 2 // 2 hours
    const context = 'public_share'
    const signature = generateStreamSignature(video.id, expiry, context)

    // Append Ads assigned to this user
    const userAds = await db.select().from(adSettings).where(
      and(
        eq(adSettings.userId, video.userId),
        eq(adSettings.isActive, true)
      )
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
  }, {
    params: t.Object({ id: t.String() })
  })
  /**
   * Hardened Tracking Endpoint for Views & Ads
   *
   * View dedup:  (videoId, eventType='view', viewerFingerprint)
   *   - Same device → same fingerprint → 1 view per video
   *   - Different video → different videoId → new view allowed
   *   - Refresh / multi-tab / replay → blocked by fingerprint
   *   - New session after 30 min → still blocked (fingerprint stays same)
   *   - Incognito / clear localStorage → blocked (IP+UA fingerprint is server-side)
   *
   * Ad dedup: (videoId, sessionId, metadata) — allows multiple providers per session
   */
  .post('/:id/track', async ({ params, body, request }) => {
    // Rate limit: max 15 tracking events per minute per IP
    if (isTrackRateLimited(request)) {
      return { success: true } // Silently drop — don't reveal rate limit to spam bots
    }

    try {
      const fingerprint = generateViewerFingerprint(request)

      if (body.eventType === 'view') {
        const ua = request.headers.get('user-agent') || ''
        const country = request.headers.get('cf-ipcountry') || request.headers.get('x-vercel-ip-country') || 'Unknown'
        const device = /Mobile|Android|iP(hone|od|ad)/i.test(ua) ? 'Mobile' : 'Desktop'
        
        let browser = 'Unknown'
        if (/Chrome/i.test(ua)) browser = 'Chrome'
        else if (/Safari/i.test(ua)) browser = 'Safari'
        else if (/Firefox/i.test(ua)) browser = 'Firefox'
        else if (/Edge/i.test(ua)) browser = 'Edge'

        // Dedup by fingerprint — prevents refresh, multi-tab, incognito abuse
        const res = await db.insert(trackingEvents).values({
          videoId: params.id,
          eventType: 'view',
          sessionId: body.sessionId,
          viewerFingerprint: fingerprint,
          metadata: { country, device, browser }
        }).onConflictDoNothing().returning({ id: trackingEvents.id })

        if (res.length > 0) {
          await db.update(videos).set({ views: sql`${videos.views} + 1` }).where(eq(videos.id, params.id))
        }
      } else if (body.eventType === 'ad_impression') {
        await db.insert(trackingEvents).values({
          videoId: params.id,
          eventType: 'ad_impression',
          sessionId: body.sessionId,
          viewerFingerprint: fingerprint,
          metadata: body.metadata || null
        }).onConflictDoNothing()
      } else if (body.eventType === 'watch_progress') {
        const existing = await db.select({ id: trackingEvents.id }).from(trackingEvents)
          .where(and(
            eq(trackingEvents.sessionId, body.sessionId), 
            eq(trackingEvents.eventType, 'watch_progress')
          )).limit(1)

        if (existing.length > 0) {
          await db.update(trackingEvents).set({
            metadata: body.metadata || null,
            createdAt: new Date()
          }).where(eq(trackingEvents.id, existing[0]!.id))
        } else {
          await db.insert(trackingEvents).values({
            videoId: params.id,
            eventType: 'watch_progress',
            sessionId: body.sessionId,
            viewerFingerprint: fingerprint,
            metadata: body.metadata || null
          })
        }
      }

      return { success: true }
    } catch (e) {
      logger.error(e, 'Tracking Error:')
      return { success: true }
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      eventType: t.Union([t.Literal('view'), t.Literal('ad_impression'), t.Literal('watch_progress')]),
      sessionId: t.String({ maxLength: 64 }),
      metadata: t.Optional(t.Any())
    })
  })
  /**
   * MP4 Direct Stream & HLS Master Playlist Entry
   * Handles: GET /v/:id?token=...&expires=...&context=...
   * 
   * For MP4: 302 redirect to S3 presigned URL
   * For HLS: 302 redirect to /v/:id/master.m3u8 (picked up by wildcard route)
   */
  .get('/:id', async ({ params, query, request, set }) => {
    const { id } = params

    // Anti-Hotlinking
    const referer = request.headers.get('referer')
    const origin = request.headers.get('origin')
    const fetchMode = request.headers.get('sec-fetch-mode')
    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
    
    const isFromFrontend = (referer?.startsWith(allowedOrigin)) || (origin?.startsWith(allowedOrigin))
    if (!isFromFrontend && fetchMode === 'navigate') {
      throw error(errorCodes.INVALID_TOKEN, 'Unauthorized access')
    }

    // Verify Access Token
    if (!query.token || !query.expires || !verifyStreamSignature(id, parseInt(query.expires), query.token, query.context)) {
      throw error(errorCodes.INVALID_TOKEN, 'Stream session expired or invalid')
    }

    const video = await videoService.getVideoById('all_access', id)
    if (!video || !video.bucketId) {
      throw error(errorCodes.NOT_FOUND, 'Video not found')
    }

    // Enforce Visibility against Public Share Tokens
    if ((video.visibility === 'private' || video.isPrivate) && query.context === 'public_share') {
      throw error(errorCodes.INVALID_TOKEN, 'This video is private and cannot be viewed via public links')
    }

    // MP4 mode → Proxy the stream directly to hide S3 endpoints completely
    if (!video.hlsPath || video.processingMode === 'mp4') {
      const { client, creds } = await getS3ClientForBucket(video.bucketId)
      try {
        const range = request.headers.get('range')
        const s3Response = await client.send(new GetObjectCommand({
          Bucket: creds.name,
          Key: video.videoUrl,
          Range: range || undefined
        }))

        // Bandwidth quota check
        const contentLength = s3Response.ContentLength ?? 0
        if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
          throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded. Upgrade your plan for more bandwidth.')
        }

        set.status = s3Response.$metadata.httpStatusCode || 200
        if (s3Response.ContentRange) set.headers['Content-Range'] = s3Response.ContentRange
        if (s3Response.AcceptRanges) set.headers['Accept-Ranges'] = s3Response.AcceptRanges
        set.headers['Content-Type'] = s3Response.ContentType || 'video/mp4'
        if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()

        // Track bandwidth (fire-and-forget)
        if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})

        // Client is cached — do NOT destroy it
        return s3Response.Body as any
      } catch (err: any) {
        if (err.statusCode) throw err
        if (err.name === 'NoSuchKey') throw error(errorCodes.NOT_FOUND, 'Video file not found')
        throw error(errorCodes.INTERNAL_ERROR, 'Failed to proxy video stream')
      }
    }

    // HLS mode → redirect to wildcard route with master playlist
    const host = request.headers.get('host')
    const protocol = host?.includes('localhost') ? 'http' : 'https'
    let tokenParams = `token=${query.token}&expires=${query.expires}`
    if (query.context) tokenParams += `&context=${query.context}`

    set.status = 302
    set.headers['Location'] = `${protocol}://${host}/v/${id}/${path.basename(video.hlsPath)}?${tokenParams}`
    return
  }, {
    params: t.Object({ id: t.String() }),
    query: t.Object({
      token: t.String(),
      expires: t.String(),
      context: t.Optional(t.String())
    })
  })
  /**
   * Adaptive Bitrate HLS Entry & Segment Redirector
   */
  .get('/:id/*', async ({ params, query, request, set }) => {
    const { id, '*': internalPath } = params
    
    // 0. Anti-Hotlinking
    const referer = request.headers.get('referer')
    const origin = request.headers.get('origin')
    const fetchMode = request.headers.get('sec-fetch-mode')
    const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173'
    
    const isFromFrontend = (referer?.startsWith(allowedOrigin)) || (origin?.startsWith(allowedOrigin))
    if (!isFromFrontend && fetchMode === 'navigate') {
      throw error(errorCodes.INVALID_TOKEN, 'Unauthorized access')
    }

    // 1. Verify Access Token
    if (!query.token || !query.expires || !verifyStreamSignature(id, parseInt(query.expires), query.token, query.context)) {
      throw error(errorCodes.INVALID_TOKEN, 'Stream session expired or invalid')
    }

    const video = await videoService.getVideoById('all_access', id)
    if (!video || !video.bucketId) {
      throw error(errorCodes.NOT_FOUND, 'Video not found')
    }

    // Enforce Visibility against Public Share Tokens
    if ((video.visibility === 'private' || video.isPrivate) && query.context === 'public_share') {
      throw error(errorCodes.INVALID_TOKEN, 'This video is private and cannot be viewed via public links')
    }

    // 2. MP4 Streaming (Free Plan / Legacy) proxies the stream
    if (!video.hlsPath || video.processingMode === 'mp4') {
      const { client, creds } = await getS3ClientForBucket(video.bucketId)
      try {
        const range = request.headers.get('range')
        const s3Response = await client.send(new GetObjectCommand({
          Bucket: creds.name,
          Key: video.videoUrl,
          Range: range || undefined
        }))

        // Bandwidth quota check
        const contentLength = s3Response.ContentLength ?? 0
        if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
          throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded. Upgrade your plan for more bandwidth.')
        }

        set.status = s3Response.$metadata.httpStatusCode || 200
        if (s3Response.ContentRange) set.headers['Content-Range'] = s3Response.ContentRange
        if (s3Response.AcceptRanges) set.headers['Accept-Ranges'] = s3Response.AcceptRanges
        set.headers['Content-Type'] = s3Response.ContentType || 'video/mp4'
        if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()

        // Track bandwidth (fire-and-forget)
        if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})

        return s3Response.Body as any
      } catch (err: any) {
        if (err.statusCode) throw err
        throw error(errorCodes.INTERNAL_ERROR, 'Stream proxy failed')
      }
    }

    // 3. HLS Streaming (Creator / Pro Plan)
    const { client, creds } = await getS3ClientForBucket(video.bucketId)

    // Normalize path separators to forward slashes for S3 compatibility
    const normalizedHlsPath = (video.hlsPath || '').replace(/\\/g, '/')
    const lastSlashIndex = normalizedHlsPath.lastIndexOf('/')
    const hlsDir = lastSlashIndex !== -1 ? normalizedHlsPath.substring(0, lastSlashIndex) : ''
    
    // If internalPath is empty (accessed /v/:id/), fetch the master playlist
    const targetFile = internalPath || normalizedHlsPath.split('/').pop() || ''
    const s3Key = hlsDir ? `${hlsDir}/${targetFile}` : targetFile

    // ── Proxy Segment Chunks To Hide S3 Domain ──
    if (targetFile.endsWith('.ts')) {
      try {
        const s3Response = await client.send(new GetObjectCommand({
          Bucket: creds.name,
          Key: s3Key,
        }))

        // Bandwidth quota check (segments only, not playlists)
        const contentLength = s3Response.ContentLength ?? 0
        if (contentLength > 0 && !await checkBandwidthQuota(video.userId, contentLength)) {
          throw error(errorCodes.RATE_LIMIT_EXCEEDED, 'Weekly bandwidth limit exceeded. Upgrade your plan for more bandwidth.')
        }

        set.status = s3Response.$metadata.httpStatusCode || 200
        set.headers['Content-Type'] = s3Response.ContentType || 'video/MP2T'
        if (s3Response.ContentLength) set.headers['Content-Length'] = s3Response.ContentLength.toString()
        set.headers['Cache-Control'] = 'public, max-age=3600'

        // Track bandwidth (fire-and-forget)
        if (contentLength > 0) trackBandwidth(video.userId, contentLength).catch(() => {})

        return s3Response.Body as any
      } catch (err: any) {
        logger.error({
          event: 'stream_segment_failed',
          videoId: id,
          s3Key,
          error: err.message,
          stack: err.stack,
          code: err.code || err.$metadata?.httpStatusCode
        })
        throw error(errorCodes.NOT_FOUND, 'Segment missing')
      }
    }

    // ── Playlist Signing (Master & Media) ──
    try {
      const data = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: s3Key }))
      const content = await data.Body?.transformToString()
      if (!content) throw new Error('Empty')

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
      logger.error({ event: 'playlist_sign_failed', videoId: id, s3Key, error: err.message, stack: err.stack })
      throw error(errorCodes.NOT_FOUND, 'Asset not found')
    }
  }, {
    params: t.Object({ id: t.String(), '*': t.String() }),
    query: t.Object({ 
      token: t.String(), 
      expires: t.String(),
      context: t.Optional(t.String())
    })
  })

  /** Rest of routes (thumbnail) remains similar */
  .get('/:id/thumbnail', async ({ params: { id }, set }) => {
    const video = await videoService.getVideoById('all_access', id)
    if (!video || !video.thumbnailPath || !video.bucketId) throw error(errorCodes.NOT_FOUND, 'Thumbnail missing')
    const { client, creds } = await getS3ClientForBucket(video.bucketId)
    const data = await client.send(new GetObjectCommand({ Bucket: creds.name, Key: video.thumbnailPath }))
    set.headers['Content-Type'] = 'image/webp'
    set.headers['Cache-Control'] = 'public, max-age=86400'
    return data.Body
  }, { params: t.Object({ id: t.String() }) })
