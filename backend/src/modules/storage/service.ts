import { db, storageProviders, storageBuckets, videos } from '../../schema'
import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { error, errorCodes } from '../../utils/response'
import { encryptSecret, decryptSecret } from '../../utils/crypto'
import { logger } from '../../utils/logger'
import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { createS3Client } from '../../utils/s3'
import { GB, MB } from '../../utils/constants'

// ─── Types ─────────────────────────────────────────────────────
export interface BucketCredentials {
  name: string
  region: string | null
  endpoint: string | null
  accessKey: string
  secretKey: string
  providerType: string
}

export interface AvailableBucket {
  id: string
  credentials: BucketCredentials
}

// ─── Service ───────────────────────────────────────────────────
class StorageService {

  // ─── Providers ─────────────────────────────────────────────
  async getProviders() {
    try {
      return await db.select().from(storageProviders).orderBy(storageProviders.name)
    } catch (err: any) {
      logger.error({ event: 'get_providers_failed', error: err.message || err, stack: err.stack })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to fetch storage providers')
    }
  }

  async setProviderActive(id: string, isActive: boolean) {
    try {
      const [provider] = await db.update(storageProviders)
        .set({ isActive })
        .where(eq(storageProviders.id, id))
        .returning()
      return provider
    } catch (err: any) {
      logger.error({ event: 'set_provider_active_failed', error: err.message || err, stack: err.stack, id })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to update provider status')
    }
  }

  // ─── Bucket CRUD ───────────────────────────────────────────
  async getBuckets() {
    return db.select({
      id: storageBuckets.id,
      providerId: storageBuckets.providerId,
      name: storageBuckets.name,
      region: storageBuckets.region,
      endpoint: storageBuckets.endpoint,
      isActive: storageBuckets.isActive,
      isDefault: storageBuckets.isDefault,
      maxStorageBytes: storageBuckets.maxStorageBytes,
      usedStorageBytes: storageBuckets.usedStorageBytes,
      createdAt: storageBuckets.createdAt,
    }).from(storageBuckets).orderBy(desc(storageBuckets.createdAt))
  }

  async getBucketFullById(id: string) {
    try {
      const [bucket] = await db.select().from(storageBuckets).where(eq(storageBuckets.id, id)).limit(1)
      if (!bucket) throw error(errorCodes.NOT_FOUND, 'Bucket not found')
      return bucket
    } catch (err: any) {
      if (err.statusCode) throw err
      logger.error({ event: 'get_bucket_failed', error: err, stack: err.stack, id })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to fetch bucket configuration')
    }
  }

  async createBucket(data: any) {
    try {
      const encryptedData: any = {
        ...data,
        name: data.name?.trim(),
        region: data.region?.trim() || "auto",
        endpoint: data.endpoint?.trim() || undefined,
        accessKey: encryptSecret(data.accessKey?.trim()),
        secretKey: encryptSecret(data.secretKey?.trim()),
        encryptionVersion: 1,
        maxStorageBytes: (data.maxStorageGB || 0) * GB,
        usedStorageBytes: (data.usedStorageGB || 0) * GB,
      }
      delete encryptedData.maxStorageGB
      delete encryptedData.usedStorageGB
      if (encryptedData.isDefault) {
        await db.update(storageBuckets).set({ isDefault: false })
      }
      const [bucket] = await db.insert(storageBuckets).values(encryptedData).returning()
      return bucket
    } catch (err: any) {
      logger.error({ event: 'create_bucket_failed', error: err, stack: err.stack })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to create bucket configuration')
    }
  }

  async updateBucket(id: string, data: any) {
    const updatePayload = { ...data }
    if (updatePayload.name) updatePayload.name = updatePayload.name.trim()
    if (updatePayload.region) updatePayload.region = updatePayload.region.trim()
    if (updatePayload.endpoint) updatePayload.endpoint = updatePayload.endpoint.trim()

    // Only re-encrypt if new keys are provided
    if (updatePayload.accessKey) {
      updatePayload.accessKey = encryptSecret(updatePayload.accessKey.trim())
    }
    if (updatePayload.secretKey) {
      updatePayload.secretKey = encryptSecret(updatePayload.secretKey.trim())
    }
    if (updatePayload.maxStorageGB !== undefined) {
      updatePayload.maxStorageBytes = updatePayload.maxStorageGB * GB
      delete updatePayload.maxStorageGB
    }
    if (updatePayload.usedStorageGB !== undefined) {
      updatePayload.usedStorageBytes = updatePayload.usedStorageGB * GB
      delete updatePayload.usedStorageGB
    }
    if (updatePayload.isDefault) {
      await db.update(storageBuckets).set({ isDefault: false })
    }
    const [bucket] = await db.update(storageBuckets).set(updatePayload).where(eq(storageBuckets.id, id)).returning()
    return bucket
  }

  async setDefaultBucket(id: string) {
    await db.update(storageBuckets).set({ isDefault: false })
    const [bucket] = await db.update(storageBuckets).set({ isDefault: true }).where(eq(storageBuckets.id, id)).returning()
    return bucket
  }

  async deleteBucket(id: string) {
    try {
      const [bucket] = await db.delete(storageBuckets).where(eq(storageBuckets.id, id)).returning()
      return bucket
    } catch (err: any) {
      logger.error({ event: 'delete_bucket_failed', error: err, stack: err.stack, id })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to delete bucket configuration')
    }
  }

  // ─── Credential Decryption ────────────────────────────────
  async getBucketCredentials(bucketId: string): Promise<BucketCredentials> {
    const bucket = await this.getBucketFullById(bucketId)
    const [provider] = await db.select().from(storageProviders).where(eq(storageProviders.id, bucket.providerId)).limit(1)

    return {
      name: bucket.name,
      region: bucket.region,
      endpoint: bucket.endpoint,
      accessKey: decryptSecret(bucket.accessKey),
      secretKey: decryptSecret(bucket.secretKey),
      providerType: provider?.type || 'unknown',
    }
  }

  // ─── Auto Bucket Selection ────────────────────────────────
  /**
   * Finds the best available bucket for a given file size.
   * Strategy: active buckets → has capacity → sorted by lowest usage (spread load).
   * Prefers the default bucket if it has capacity.
   */
  async getAvailableBucket(fileSizeBytes: number): Promise<AvailableBucket> {
    try {
      const fileSizeGB = fileSizeBytes / GB

      // Get all active buckets from active providers, sorted by usage ASC (spread load)
      const activeBuckets = await db
        .select({
          id: storageBuckets.id,
          name: storageBuckets.name,
          region: storageBuckets.region,
          endpoint: storageBuckets.endpoint,
          accessKey: storageBuckets.accessKey,
          secretKey: storageBuckets.secretKey,
          providerId: storageBuckets.providerId,
          isDefault: storageBuckets.isDefault,
          maxStorageBytes: storageBuckets.maxStorageBytes,
          usedStorageBytes: storageBuckets.usedStorageBytes,
        })
        .from(storageBuckets)
        .innerJoin(storageProviders, eq(storageBuckets.providerId, storageProviders.id))
        .where(
          and(
            eq(storageBuckets.isActive, true),
            eq(storageBuckets.status, 'online'),
            eq(storageProviders.isActive, true)
          )
        )
        .orderBy(asc(storageBuckets.usedStorageBytes))

      // Filter by capacity
      const eligible = activeBuckets.filter(b => {
        if (b.maxStorageBytes === 0) return true // unlimited
        return (b.usedStorageBytes + fileSizeBytes) <= b.maxStorageBytes
      })

      if (eligible.length === 0) {
        throw error(errorCodes.STORAGE_LIMIT_REACHED, 'No storage bucket has enough capacity for this upload. Contact admin.')
      }

      // Prefer default bucket if it's in the eligible list
      const defaultBucket = eligible.find(b => b.isDefault)
      const selected = defaultBucket || eligible[0]
      if (!selected) {
        throw error(errorCodes.STORAGE_LIMIT_REACHED, 'No selection available')
      }

      const [provider] = await db.select().from(storageProviders).where(eq(storageProviders.id, selected.providerId)).limit(1)

      return {
        id: selected.id,
        credentials: {
          name: selected.name,
          region: selected.region,
          endpoint: selected.endpoint || null,
          accessKey: decryptSecret(selected.accessKey),
          secretKey: decryptSecret(selected.secretKey),
          providerType: provider?.type || 'unknown',
        }
      }
    } catch (err: any) {
      if (err.statusCode) throw err
      logger.error({ event: 'get_available_bucket_failed', error: err, stack: err.stack, fileSizeBytes })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to select available storage bucket')
    }
  }

  /**
   * Get an ordered list of fallback buckets (excluding a specific bucket).
   * Used by the failover system.
   */
  async getFallbackBuckets(fileSizeBytes: number, excludeBucketId: string): Promise<AvailableBucket[]> {
    const fileSizeGB = fileSizeBytes / GB

    const activeBuckets = await db
      .select({
        id: storageBuckets.id,
        name: storageBuckets.name,
        region: storageBuckets.region,
        endpoint: storageBuckets.endpoint,
        accessKey: storageBuckets.accessKey,
        secretKey: storageBuckets.secretKey,
        providerId: storageBuckets.providerId,
        maxStorageBytes: storageBuckets.maxStorageBytes,
        usedStorageBytes: storageBuckets.usedStorageBytes,
      })
      .from(storageBuckets)
      .innerJoin(storageProviders, eq(storageBuckets.providerId, storageProviders.id))
      .where(
        and(
          eq(storageBuckets.isActive, true),
          eq(storageBuckets.status, 'online'),
          eq(storageProviders.isActive, true)
        )
      )
      .orderBy(asc(storageBuckets.usedStorageBytes))

    const eligible = activeBuckets
      .filter(b => b.id !== excludeBucketId)
      .filter(b => b.maxStorageBytes === 0 || (b.usedStorageBytes + fileSizeBytes) <= b.maxStorageBytes)

    const results: AvailableBucket[] = []
    for (const b of eligible) {
      const [provider] = await db.select().from(storageProviders).where(eq(storageProviders.id, b.providerId)).limit(1)
      results.push({
        id: b.id,
        credentials: {
          name: b.name,
          region: b.region,
          endpoint: b.endpoint,
          accessKey: decryptSecret(b.accessKey),
          secretKey: decryptSecret(b.secretKey),
          providerType: provider?.type || 'unknown',
        }
      })
    }
    return results
  }

  // ─── Usage Tracking ───────────────────────────────────────
  /**
   * Increment usedStorageGB after a successful upload.
   */
  async trackUpload(bucketId: string, fileSizeBytes: number) {
    await db.update(storageBuckets)
      .set({ usedStorageBytes: sql`${storageBuckets.usedStorageBytes} + ${fileSizeBytes}` })
      .where(eq(storageBuckets.id, bucketId))
    logger.info({ event: 'storage_upload_tracked', bucketId, mb: +(fileSizeBytes / MB).toFixed(2) })
  }

  /**
   * Decrement usedStorageGB after a video is deleted.
   */
  async trackDeletion(bucketId: string, fileSizeBytes: number) {
    await db.update(storageBuckets)
      .set({ usedStorageBytes: sql`GREATEST(${storageBuckets.usedStorageBytes} - ${fileSizeBytes}, 0)` })
      .where(eq(storageBuckets.id, bucketId))
    // No individual log - caller should batch deletion logs
  }

  /**
   * Completely wipe a video directory (e.g. videos/{userId}/{videoId}/) from Object Storage.
   * Also deletes the original uploaded file if provided.
   */
  async deleteVideoFiles(bucketId: string, videoId: string, userId: string, videoUrl?: string) {
    try {
      const creds = await this.getBucketCredentials(bucketId)
      const client = createS3Client(creds)

      // 1. Delete the raw upload file if it exists
      if (videoUrl) {
        await client.send(new DeleteObjectCommand({ Bucket: creds.name, Key: videoUrl })).catch(() => {})
      }

      // 2. Delete the processed folder
      const prefix = `videos/${userId}/${videoId}/`
      let continuationToken: string | undefined

      do {
        const listRes = await client.send(
          new ListObjectsV2Command({
            Bucket: creds.name,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        )

        if (listRes.Contents && listRes.Contents.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: creds.name,
              Delete: {
                Objects: listRes.Contents.map((obj) => ({ Key: obj.Key })),
                Quiet: true,
              },
            })
          )
        }

        continuationToken = listRes.NextContinuationToken
      } while (continuationToken)

      logger.info({ event: 's3_video_files_cleaned', bucketId, videoId, prefix })
    } catch (err: any) {
      logger.error({ event: 'delete_video_files_failed', error: err, stack: err.stack, bucketId, videoId })
      // Even if file deletion fails, we typically don't throw to avoid failing the DB transaction
    }
  }

  /**
   * Adjust usage when a video file is replaced. 
   */
  async trackReplacement(bucketId: string, oldSizeBytes: number, newSizeBytes: number) {
    const diff = (newSizeBytes - oldSizeBytes)
    if (diff >= 0) {
      await db.update(storageBuckets)
        .set({ usedStorageBytes: sql`${storageBuckets.usedStorageBytes} + ${diff}` })
        .where(eq(storageBuckets.id, bucketId))
    } else {
      await db.update(storageBuckets)
        .set({ usedStorageBytes: sql`GREATEST(${storageBuckets.usedStorageBytes} + ${diff}, 0)` })
        .where(eq(storageBuckets.id, bucketId))
    }
    logger.info({ event: 'storage_adjusted', bucketId, mb: +(diff / MB).toFixed(2), delta: diff >= 0 ? '+' : '' })
  }

  // ─── Limit Enforcement ────────────────────────────────────
  async checkBucketLimit(id: string, fileSizeBytes: number): Promise<boolean> {
    const bucket = await this.getBucketFullById(id)
    if (bucket.maxStorageBytes > 0 && (bucket.usedStorageBytes + fileSizeBytes) > bucket.maxStorageBytes) {
      return false
    }
    return true
  }

  // ─── Connection Testing ───────────────────────────────────
  async fixBucketCors(id: string) {
    const creds = await this.getBucketCredentials(id)
    const client = createS3Client(creds)

    try {
      const command = new PutBucketCorsCommand({
        Bucket: creds.name,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
              AllowedOrigins: ["*"], // In production, we'd narrow this to the frontend URL
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3000
            }
          ]
        }
      })
      await client.send(command)
      return { success: true, message: 'CORS policy updated successfully' }
    } catch (err: any) {
      logger.error({ event: 'fix_bucket_cors_failed', error: err, stack: err.stack, bucketId: id })
      throw error(errorCodes.INTERNAL_ERROR, `Failed to update CORS: ${err.message}`)
    } finally {
      client.destroy()
    }
  }

  async testBucketConnection(id: string) {
    let creds: BucketCredentials
    try {
      creds = await this.getBucketCredentials(id)
    } catch (err: any) {
      logger.error({ 
        event: 'decrypt_credentials_failed', 
        error: err.message || err, 
        name: err.name,
        bucketId: id 
      })
      
      const isMismatch = err.message?.includes('DECRYPT_FAILED') || err.message?.includes('auth')
      
      return {
        connected: false,
        listObjects: false,
        upload: false,
        delete: false,
        message: isMismatch 
          ? 'Encryption Key Mismatch: Credentials cannot be decrypted with the current STORAGE_ENCRYPTION_KEY.' 
          : 'Decryption Error: Invalid storage credentials format.',
        errors: ["Authentication decryption error: " + (err.message || 'Unknown error')]
      }
    }

    const testPath = "__healthcheck__/test.txt"
    const results = {
      connected: false,
      listObjects: false,
      upload: false,
      delete: false,
      message: '',
      errors: [] as string[],
    }

    const runAttempt = async (attempt: number) => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const usePathStyle = creds.providerType === 'r2' ? false : !!creds.endpoint

      const client = new S3Client({
        region: creds.region || (creds.providerType === 'r2' ? 'auto' : 'us-east-1'),
        endpoint: creds.endpoint || undefined,
        credentials: {
          accessKeyId: creds.accessKey,
          secretAccessKey: creds.secretKey,
        },
        forcePathStyle: usePathStyle,
      })

      try {
        // 1. List
        const listCmd = new ListObjectsV2Command({ Bucket: creds.name, MaxKeys: 1 })
        await client.send(listCmd, { abortSignal: controller.signal as any })
        results.listObjects = true
        results.connected = true

        // 2. Upload (SSE only on providers that support it)
        const sseParams = (creds.providerType === 'aws' || creds.providerType === 'r2')
          ? { ServerSideEncryption: 'AES256' as const }
          : {}
        const putCmd = new PutObjectCommand({
          Bucket: creds.name,
          Key: testPath,
          Body: "HEALTH_CHECK_TEST",
          ContentType: "text/plain",
          ...sseParams,
        })
        await client.send(putCmd, { abortSignal: controller.signal as any })
        results.upload = true

        // 3. Head (Access)
        const headCmd = new HeadObjectCommand({ Bucket: creds.name, Key: testPath })
        await client.send(headCmd, { abortSignal: controller.signal as any })

        // 4. Cleanup
        const delCmd = new DeleteObjectCommand({ Bucket: creds.name, Key: testPath })
        await client.send(delCmd, { abortSignal: controller.signal as any })
        results.delete = true

        return true
      } catch (err: any) {
        logger.error({
          event: "bucket_test_attempt_failed",
          attempt,
          bucketId: id,
          error: err.name || "UnknownError",
          rawMessage: err.message
        })
        
        if (attempt >= 3) {
          if (err.name === "AbortError") results.errors.push("Connection timed out after 10 seconds")
          else if (err.name === "AccessDenied" || err.message?.includes("403")) results.errors.push("Access Denied: Check permissions or keys")
          else if (err.message?.includes("ENOTFOUND")) results.errors.push("Network Error: Could not resolve endpoint")
          else results.errors.push(`Failure: ${err.message || 'Unknown bucket error'}`)
        }
        return false
      } finally {
        clearTimeout(timeoutId)
        client.destroy()
      }
    }

    try {
      let successCount = 0
      for (let i = 1; i <= 3; i++) {
          const ok = await runAttempt(i)
          if (ok) {
              successCount++
              break
          }
          if (i < 3) await new Promise(r => setTimeout(r, 1000))
      }

      const finalStatus = results.connected && results.upload && results.delete ? 'online' : (results.connected ? 'degraded' : 'offline')
      await db.update(storageBuckets)
        .set({ 
            status: finalStatus,
            lastHealthCheckAt: new Date()
        })
        .where(eq(storageBuckets.id, id))

      results.message = successCount > 0 
          ? "Perfect! All tests passed (List, Upload, Access, Delete)" 
          : "Some tests failed. Check the error log."

      return results
    } catch (err: any) {
      logger.error({ event: 'test_bucket_connection_crash', error: err, stack: err.stack, bucketId: id })
      return {
        ...results,
        message: 'Test crashed unexpectedly. Please check server logs.',
        errors: [err.message]
      }
    }
  }

}

export const storageService = new StorageService()
