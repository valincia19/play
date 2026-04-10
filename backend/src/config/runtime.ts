import { logger, logEvents } from '../utils/logger'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    logger.error({ event: logEvents.SERVER_ERROR, message: `${name} missing` })
    throw new Error(`${name} environment variable is required`)
  }
  return value
}

function assertStorageEncryptionKey() {
  const encryptionKey = requireEnv('STORAGE_ENCRYPTION_KEY')
  if (encryptionKey.length !== 64) {
    logger.error({
      event: logEvents.SERVER_ERROR,
      message: 'STORAGE_ENCRYPTION_KEY must be a 64-character hex string'
    })
    logger.fatal({ event: 'missing_encryption_key', message: 'STORAGE_ENCRYPTION_KEY must be a 64-character hex string' })
    process.exit(1)
  }
  return encryptionKey
}

export interface ApiRuntimeConfig {
  frontendUrl: string
  port: number
}

export interface WorkerRuntimeConfig {
  heartbeatTtlSec: number
}

export function loadApiRuntimeConfig(): ApiRuntimeConfig {
  const frontendUrl = requireEnv('FRONTEND_URL')
  assertStorageEncryptionKey()

  return {
    frontendUrl,
    port: Number(process.env.PORT) || 4000,
  }
}

export function loadWorkerRuntimeConfig(): WorkerRuntimeConfig {
  requireEnv('REDIS_URL')
  requireEnv('DATABASE_URL')
  assertStorageEncryptionKey()

  return {
    heartbeatTtlSec: 30,
  }
}
