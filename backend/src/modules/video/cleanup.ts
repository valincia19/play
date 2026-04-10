/**
 * Video Cleanup & Recovery — extracted from video/processor.ts
 *
 * Handles cleanup of stale temp files, orphaned S3 objects,
 * stuck jobs, and stale uploads.
 */

import path from 'path'
import fs from 'fs/promises'
import { db, videos } from '../../schema'
import { eq, and, like, or, lt } from 'drizzle-orm'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createS3Client } from '../../utils/s3'
import { getCachedS3Client } from '../../utils/s3-helpers'
import { storageService } from '../storage'
import { logger } from '../../utils/logger'
import type { Queue } from 'bullmq'
import type { S3Client } from '@aws-sdk/client-s3'

const TEMP_DIR = path.join(process.cwd(), 'tmp-processing')

/**
 * Cleanup stale local temp directories.
 * Removes directories older than maxAgeMs.
 */
export async function cleanupStaleTemp(maxAgeMs: number = 60 * 60 * 1000) {
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
 */
export async function cleanupOrphanedRemoteTempSources(maxErrorAgeMs: number = 60 * 60 * 1000) {
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
export async function recoverStuckJobs(
  videoQueue: Queue,
  maxAgeMs: number = 30 * 60 * 1000,
  shouldRequeue: boolean = false
) {
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

        // Clean up BullMQ queue
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

        // Cleanup /tmp
        try {
          const jobDir = path.join(TEMP_DIR, videoId)
          await fs.rm(jobDir, { recursive: true, force: true })
          logger.info({ event: 'stuck_job_tmp_cleaned', videoId })
        } catch (e: any) {
          logger.error({ event: 'stuck_job_tmp_clean_failed', videoId, error: e.message, stack: e.stack })
        }

        // Requeue if needed
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
export async function cleanupStaleUploads(maxAgeMs: number = 2 * 60 * 60 * 1000): Promise<number> {
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
      if (video.bucketId && video.videoUrl) {
        const creds = await storageService.getBucketCredentials(video.bucketId)
        const client = createS3Client(creds)
        await client.send(new DeleteObjectCommand({
          Bucket: creds.name,
          Key: video.videoUrl,
        })).catch(() => {})
        client.destroy()
      }

      if (video.bucketId && video.fileSizeBytes && video.fileSizeBytes > 0) {
        await storageService.trackDeletion(video.bucketId, Number(video.fileSizeBytes))
      }

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