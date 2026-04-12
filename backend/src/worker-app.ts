import { logger } from './utils/logger'
import { redisManager } from './utils/redis'
import { db, videos, trackingEvents } from './schema'
import { eq, sql, and } from 'drizzle-orm'
import { Worker } from 'bullmq'
import os from 'os'
import { loadWorkerRuntimeConfig } from './config/runtime'
import { VideoProcessor, videoQueue } from './modules/video'
import { billingService } from './modules/billing'

const CRON_INTERVAL_MS = 10 * 60 * 1000 // Every 10 minutes
const VIEWS_INTERVAL_MS = 15 * 1000 // Every 15 seconds
const HEARTBEAT_INTERVAL_MS = 5 * 1000
const TEMP_CLEANUP_INTERVAL_MS = 10 * 60 * 1000
const LOCAL_TEMP_MAX_AGE_MS = 60 * 60 * 1000
const REMOTE_TEMP_ERROR_MAX_AGE_MS = 60 * 60 * 1000
const STALE_UPLOAD_MAX_AGE_MS = 2 * 60 * 60 * 1000
const { heartbeatTtlSec } = loadWorkerRuntimeConfig()

logger.info({ event: 'worker_started' })

const workerStartedAt = new Date().toISOString()

async function updateWorkerHeartbeat() {
  try {
    const redis = await redisManager.getClient()
    await redis.set(
      'worker:heartbeat',
      JSON.stringify({
        pid: process.pid,
        startedAt: workerStartedAt,
        lastSeenAt: new Date().toISOString(),
        uptimeSec: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      }),
      'EX',
      heartbeatTtlSec
    )
  } catch (err: any) {
    logger.error({ event: 'worker_heartbeat_failed', message: err.message })
  }
}

async function processViewsBatch() {
  try {
    const views = await redisManager.lpop('queue:views', 500)
    if (!views || views.length === 0) return

    const viewCounts: Record<string, number> = {}
    for (const view of views) {
      if (!viewCounts[view.videoId]) viewCounts[view.videoId] = 0
      viewCounts[view.videoId]! += 1
    }

    for (const [videoId, count] of Object.entries(viewCounts)) {
      await db.update(videos)
        .set({ views: sql`${videos.views} + ${count}` })
        .where(eq(videos.id, videoId))
    }

    logger.info({
      event: 'cron_processed_views',
      data: { ingestedLength: views.length, uniqueVideos: Object.keys(viewCounts).length }
    })
  } catch (err: any) {
    logger.error({ event: 'cron_views_error', message: err.message })
  }
}

async function processTrackingBatch() {
  try {
    const rawEvents = await redisManager.lpop('queue:tracking', 500)
    if (!rawEvents || rawEvents.length === 0) return

    const inserts: any[] = []
    const progressUpdates: Record<string, any> = {}

    for (const event of rawEvents) {
      if (event.eventType === 'watch_progress') {
        const key = `${event.sessionId}:${event.videoId}`
        progressUpdates[key] = event
      } else {
        inserts.push({
          videoId: event.videoId,
          eventType: event.eventType,
          sessionId: event.sessionId,
          viewerFingerprint: event.viewerFingerprint,
          metadata: event.metadata,
        })
      }
    }

    // 1. Bulk Inserts (Views & Impressions)
    if (inserts.length > 0) {
      await db.insert(trackingEvents).values(inserts).onConflictDoNothing()
    }

    // 2. Individual Updates (Watch Progress)
    // We update the latest progress for each session+video pair in the batch
    for (const event of Object.values(progressUpdates)) {
      const existing = await db.select({ id: trackingEvents.id }).from(trackingEvents)
        .where(and(
          eq(trackingEvents.sessionId, event.sessionId),
          eq(trackingEvents.eventType, event.eventType)
        ))
        .limit(1)

      if (existing.length > 0) {
        await db.update(trackingEvents).set({
          metadata: event.metadata,
          createdAt: new Date()
        }).where(eq(trackingEvents.id, existing[0]!.id))
      } else {
        await db.insert(trackingEvents).values({
          videoId: event.videoId,
          eventType: 'watch_progress',
          sessionId: event.sessionId,
          viewerFingerprint: event.viewerFingerprint,
          metadata: event.metadata
        }).onConflictDoNothing()
      }
    }

    logger.info({
      event: 'cron_processed_tracking',
      data: { ingestedLength: rawEvents.length, progressUpdates: Object.keys(progressUpdates).length }
    })
  } catch (err: any) {
    logger.error({ event: 'cron_tracking_error', message: err.message })
  }
}

export async function runWorkerApp() {
  await updateWorkerHeartbeat()

  await VideoProcessor.recoverStuckJobs(30 * 60 * 1000, false)
  logger.info({ event: 'worker_boot_stuck_recovery_done' })

  // Adaptive concurrency: leave at least 1 core free for the OS and API server.
  // 1-2 cores → 1 worker, 3-4 cores → 2 workers, 5+ cores → 3 workers (cap at 4).
  const cpuCount = os.cpus().length
  const workerConcurrency = Math.min(Math.max(1, Math.floor((cpuCount - 1) / 2)), 4)
  logger.info({ event: 'worker_concurrency', cpuCount, workerConcurrency })

  const processingWorker = new Worker('video-processing', async (job: any) => {
    if (job.name === 'process-video' || job.name === 'process-hls') {
      const { videoId } = job.data

      // Fetch userId for richer logging
      const [video] = await db.select({ userId: videos.userId }).from(videos).where(eq(videos.id, videoId)).limit(1)

      logger.info({
        event: 'job_started',
        jobId: job.id,
        name: job.name,
        videoId,
        userId: video?.userId,
        attemptsMade: job.attemptsMade,
      })
      await VideoProcessor.processVideo(videoId)
    } else if (job.name === 'import-video') {
      const { videoId, remoteUrl } = job.data
      
      const [video] = await db.select({ userId: videos.userId }).from(videos).where(eq(videos.id, videoId)).limit(1)
      
      logger.info({
        event: 'job_started',
        jobId: job.id,
        name: job.name,
        videoId,
        userId: video?.userId,
        remoteUrl,
        attemptsMade: job.attemptsMade,
      })
      
      await VideoProcessor.importVideo(videoId, remoteUrl)
    }
  }, {
    connection: redisManager.duplicate(),
    concurrency: workerConcurrency,
    lockDuration: 600000,   // 10 min — long enough for large HLS jobs
    stalledInterval: 60000, // check for stalled jobs every 60s
    maxStalledCount: 1,     // fail fast on stall; BullMQ retries handle recovery
  })

  processingWorker.on('completed', (job: any) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined
    logger.info({
      event: 'job_completed',
      jobId: job.id,
      name: job.name,
      videoId: job.data?.videoId,
      durationMs,
      attemptsMade: job.attemptsMade,
    })
  })
  processingWorker.on('failed', async (job: any, err: any) => {
    const durationMs = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined

    logger.error({
      event: 'job_failed',
      jobId: job?.id,
      name: job?.name,
      videoId: job?.data?.videoId,
      errorName: err?.name,
      errorMessage: err?.message,
      errorStack: err?.stack,
      durationMs,
      attemptsMade: job?.attemptsMade,
      willRetry: (job?.attemptsMade ?? 0) < (job?.opts?.attempts ?? 1),
    })

    // Mark final DB error only when all BullMQ retry attempts are exhausted.
    const attempts = Number(job?.opts?.attempts ?? 1)
    const attemptsMade = Number(job?.attemptsMade ?? 0)
    const isFinalFailure = attemptsMade >= attempts
    const isVideoJob = job?.name === 'process-video' || job?.name === 'process-hls'
    const videoId = job?.data?.videoId

    if (!isVideoJob || !videoId || !isFinalFailure) return

    const [video] = await db.select({
      id: videos.id,
      processingMode: videos.processingMode,
      errorMessage: videos.errorMessage,
    })
      .from(videos)
      .where(eq(videos.id, videoId))
      .limit(1)

    const fallbackMarker = '[hls-fallback-attempted]'
    const canFallbackToMp4 = Boolean(
      video &&
      video.processingMode === 'hls' &&
      !video.errorMessage?.includes(fallbackMarker)
    )

    if (canFallbackToMp4) {
      try {
        await job?.remove?.()
      } catch {
        // ignore remove failures; we'll still try to overwrite queue state
      }

      await db.update(videos)
        .set({
          processingMode: 'mp4',
          qualities: ['720p'],
          status: 'pending',
          errorMessage: `${fallbackMarker} HLS processing failed after retries - auto switched to MP4`,
          updatedAt: new Date(),
        })
        .where(eq(videos.id, videoId))

      await videoQueue.add('process-video', { videoId }, { jobId: videoId, delay: 1500 })

      logger.warn({
        event: 'job_final_failure_fallback_to_mp4',
        jobId: job?.id,
        videoId,
      })
      return
    }

    await db.update(videos)
      .set({
        status: 'error',
        errorMessage: 'Video processing failed after retries - please retry upload',
        updatedAt: new Date(),
      })
      .where(eq(videos.id, videoId))
      .catch((updateErr: any) => {
        logger.error({
          event: 'job_final_failure_db_update_failed',
          jobId: job?.id,
          videoId,
          message: updateErr?.message || 'Unknown DB update failure',
        })
      })
  })

  setInterval(async () => {
    try {
      const expiredCount = await billingService.processExpiredSubscriptions()
      if (expiredCount && expiredCount > 0) {
        logger.info({
          event: 'cron_processed_expired_subs',
          data: { parsedQuantity: expiredCount }
        })
      }
    } catch (err: any) {
      logger.error({ event: 'cron_expired_sub_error', message: err.message })
    }
  }, CRON_INTERVAL_MS)

  setInterval(async () => {
    try {
      await processViewsBatch()
      await processTrackingBatch()
    } catch (err: any) {
      logger.error({ event: 'views_batch_error', error: err.message, stack: err.stack })
    }
  }, VIEWS_INTERVAL_MS)
  setInterval(async () => {
    try {
      await updateWorkerHeartbeat()
    } catch (err: any) {
      logger.error({ event: 'heartbeat_error', error: err.message, stack: err.stack })
    }
  }, HEARTBEAT_INTERVAL_MS)
  setInterval(async () => {
    try {
      await VideoProcessor.cleanupStaleTemp(LOCAL_TEMP_MAX_AGE_MS)
      await VideoProcessor.cleanupOrphanedRemoteTempSources(REMOTE_TEMP_ERROR_MAX_AGE_MS)
      await VideoProcessor.cleanupStaleUploads(STALE_UPLOAD_MAX_AGE_MS)
    } catch (err: any) {
      logger.error({ event: 'temp_cleanup_error', error: err.message, stack: err.stack })
    }
  }, TEMP_CLEANUP_INTERVAL_MS)

  try {
    const catchupCount = await billingService.processExpiredSubscriptions()
    logger.info({
      event: 'worker_boot_catchup',
      data: { processed: catchupCount }
    })
  } catch (err: any) {
    logger.error({ event: 'boot_subscription_check_error', error: err.message, stack: err.stack })
  }

  await VideoProcessor.cleanupStaleTemp(LOCAL_TEMP_MAX_AGE_MS)
  await VideoProcessor.cleanupOrphanedRemoteTempSources(REMOTE_TEMP_ERROR_MAX_AGE_MS)
  await VideoProcessor.cleanupStaleUploads(STALE_UPLOAD_MAX_AGE_MS)
}

runWorkerApp().catch(err => {
  logger.error({ event: 'worker_fatal', message: err.message })
})

// Graceful shutdown handler
async function shutdown() {
  logger.info({ event: 'worker_shutdown_init' })

  // Cleanup S3 cache
  const { cleanupS3Cache } = require('./modules/video/processor')
  cleanupS3Cache()

  logger.info({ event: 'worker_shutdown_complete' })
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
