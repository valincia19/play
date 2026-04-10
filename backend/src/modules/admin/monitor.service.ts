import { db, plans, transactions, users, videos } from '../../schema'
import { desc, sql } from 'drizzle-orm'
import { redisManager } from '../../utils/redis'
import { videoQueue } from '../video'
import { storageService } from '../storage'
import { createS3Client } from '../../utils/s3'
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { logger } from '../../utils/logger'

class AdminMonitorService {
  async getStats() {
    return redisManager.getOrSet('admin:stats', 60, async () => {
      const [uCount, pCount, tCount, vCount] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(plans),
        db.select({ count: sql<number>`count(*)` }).from(transactions),
        db.select({
          count: sql<number>`count(*)`,
          views: sql<number>`sum(views)`
        }).from(videos)
      ])

      return {
        totalUsers: Number(uCount[0]?.count || 0),
        totalPlans: Number(pCount[0]?.count || 0),
        totalTransactions: Number(tCount[0]?.count || 0),
        totalVideos: Number(vCount[0]?.count || 0),
        totalViews: Number(vCount[0]?.views || 0),
      }
    })
  }

  async getWorkerMonitor() {
    const redis = await redisManager.getClient()
    const [jobCounts, heartbeatRaw, recentVideos, statusRows, failedJobs, activeJobs] = await Promise.all([
      videoQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused'),
      redis.get('worker:heartbeat'),
      db.select({
        id: videos.id,
        title: videos.title,
        userId: videos.userId,
        status: videos.status,
        processingMode: videos.processingMode,
        errorMessage: videos.errorMessage,
        createdAt: videos.createdAt,
        updatedAt: videos.updatedAt,
      })
        .from(videos)
        .orderBy(desc(videos.updatedAt))
        .limit(12),
      db.select({
        status: videos.status,
        count: sql<number>`count(*)`,
      })
        .from(videos)
        .groupBy(videos.status),
      videoQueue.getFailed(0, 9),
      videoQueue.getActive(0, 9),
    ])

    const heartbeat = heartbeatRaw ? JSON.parse(heartbeatRaw) : null
    const statusCounts = Object.fromEntries(
      ['pending', 'processing', 'ready', 'error', 'uploading'].map((status) => [status, 0])
    ) as Record<string, number>

    for (const row of statusRows) {
      statusCounts[row.status] = Number(row.count || 0)
    }

    return {
      worker: heartbeat ? {
        ...heartbeat,
        isOnline: Date.now() - new Date(heartbeat.lastSeenAt).getTime() < 20_000,
      } : {
        isOnline: false,
        lastSeenAt: null,
      },
      queue: {
        waiting: Number(jobCounts.waiting || 0),
        active: Number(jobCounts.active || 0),
        delayed: Number(jobCounts.delayed || 0),
        failed: Number(jobCounts.failed || 0),
        completed: Number(jobCounts.completed || 0),
        paused: Number(jobCounts.paused || 0),
      },
      videos: {
        total: recentVideos.length,
        byStatus: statusCounts,
        recent: recentVideos,
      },
      jobs: {
        active: activeJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
          processedOn: job.processedOn,
          timestamp: job.timestamp,
        })),
        failed: failedJobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          finishedOn: job.finishedOn,
          processedOn: job.processedOn,
          timestamp: job.timestamp,
        })),
      },
      generatedAt: new Date().toISOString(),
    }
  }

  async cleanupOrphanedS3Data() {
    let totalDeleted = 0
    let totalBytesFreed = 0

    // Fetch all active DB video IDs into a Set for fast O(1) matching
    const allVideos = await db.select({ id: videos.id }).from(videos)
    const validVideoIds = new Set(allVideos.map((v) => v.id))

    // Fetch all active storage buckets
    const buckets = await storageService.getBuckets()
    
    // We determine anything older than 24h as "stale" for temp items
    const staleThresholdMs = 24 * 60 * 60 * 1000
    const now = Date.now()

    for (const bucket of buckets) {
      if (!bucket.isActive) continue

      try {
        const creds = await storageService.getBucketCredentials(bucket.id)
        const client = createS3Client(creds)
        
        let continuationToken: string | undefined

        do {
          const listRes = await client.send(
            new ListObjectsV2Command({
              Bucket: creds.name,
              ContinuationToken: continuationToken,
            })
          )

          if (listRes.Contents && listRes.Contents.length > 0) {
            const keysToDelete: { Key: string }[] = []

            for (const obj of listRes.Contents) {
              if (!obj.Key) continue

              // Pattern 1: Orphaned processed files -> videos/<userId>/<videoId>/...
              if (obj.Key.startsWith('videos/')) {
                const parts = obj.Key.split('/')
                if (parts.length >= 3) {
                  const videoId = parts[2]
                  // If videoId doesn't exist in our latest DB state, mark for wipe
                  if (videoId && !validVideoIds.has(videoId)) {
                    keysToDelete.push({ Key: obj.Key })
                    totalBytesFreed += obj.Size || 0
                  }
                }
              }
              // Pattern 2: Orphaned temp uploads -> temp/<userId>/...
              else if (obj.Key.startsWith('temp/')) {
                const ageMs = obj.LastModified ? now - obj.LastModified.getTime() : 0
                if (ageMs > staleThresholdMs) {
                  keysToDelete.push({ Key: obj.Key })
                  totalBytesFreed += obj.Size || 0
                }
              }
            }

            // Batch delete inside this chunk
            if (keysToDelete.length > 0) {
              await client.send(
                new DeleteObjectsCommand({
                  Bucket: creds.name,
                  Delete: { Objects: keysToDelete, Quiet: true },
                })
              )
              totalDeleted += keysToDelete.length
            }
          }

          continuationToken = listRes.NextContinuationToken
        } while (continuationToken)

        client.destroy()
      } catch (err: any) {
        logger.error({ event: 'cleanup_orphan_s3_failed', error: err.message, stack: err.stack, bucketId: bucket.id })
      }
    }

    return {
      deletedItems: totalDeleted,
      bytesFreed: totalBytesFreed,
      mbFreed: +(totalBytesFreed / 1024 / 1024).toFixed(2),
    }
  }
}

export const adminMonitorService = new AdminMonitorService()
