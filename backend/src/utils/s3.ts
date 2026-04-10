import { S3Client } from '@aws-sdk/client-s3'
import type { BucketCredentials } from '../modules/storage'

/**
 * Create an S3Client from decrypted bucket credentials.
 * Centralizes config so S3Client construction isn't duplicated across services/routes.
 * 
 * Always call `client.destroy()` when done to prevent socket leaks.
 */
export function createS3Client(creds: BucketCredentials): S3Client {
  // Under Bun + AWS SDK v3, automatic flexible checksums (especially CRC32 on
  // PutObject) can produce BadDigest / checksum mismatch errors on some
  // providers, including S3-compatible targets used by this app.
  //
  // We only need checksum headers when explicitly required by an operation.
  // Using WHEN_REQUIRED keeps ordinary uploads stable while preserving support
  // for operations that mandate checksums.

  return new S3Client({
    region: creds.region || 'auto',
    endpoint: creds.endpoint || undefined,
    credentials: {
      accessKeyId: creds.accessKey,
      secretAccessKey: creds.secretKey,
    },
    forcePathStyle: creds.providerType !== 'r2',
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  })
}
