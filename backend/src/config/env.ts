import { logger, logEvents } from '../utils/logger'

// ─── Environment Variable Validator ──────────────────────────────────────
// Every variable the app needs MUST be listed here. NO fallbacks allowed.
// If missing, the app will crash on startup with a clear error message.

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    const msg = `❌ Missing required environment variable: ${name}`
    logger.fatal({ event: logEvents.SERVER_ERROR, variable: name, message: msg })
    throw new Error(msg)
  }
  return value.trim()
}

function requireEnvNumber(name: string): number {
  const raw = requireEnv(name)
  const num = Number(raw)
  if (isNaN(num)) {
    const msg = `❌ Environment variable ${name} must be a valid number, got: "${raw}"`
    logger.fatal({ event: logEvents.SERVER_ERROR, variable: name, message: msg })
    throw new Error(msg)
  }
  return num
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== '' ? value.trim() : undefined
}

// ─── Centralized Config ──────────────────────────────────────────────────

export interface AppConfig {
  // Server
  port: number
  nodeEnv: string
  logLevel: string

  // Database
  databaseUrl: string

  // Redis
  redisUrl: string

  // Auth
  jwtSecret: string

  // URLs
  frontendUrl: string
  appUrl: string
  shareDomain: string | undefined

  // SMTP
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  smtpFrom: string
  smtpFromName: string

  // Encryption
  storageEncryptionKey: string
  storageEncryptionKeyV2: string

  // Streaming
  streamSecret: string

  // Payment Gateway (Pakasir)
  pakasirSlug: string
  pakasirApiKey: string

  // Webhook Security
  webhookSecret: string

  // S3 / Storage
  s3CustomDomain: string | undefined
}

let _config: AppConfig | null = null

/**
 * Load and validate ALL environment variables at startup.
 * Call this once from app.ts / worker-app.ts entry point.
 * After that, import `env` to access values.
 */
export function loadConfig(): AppConfig {
  if (_config) return _config

  // ─── Required Variables ────────────────────────────────────────────
  const config: AppConfig = {
    // Server
    port: requireEnvNumber('PORT'),
    nodeEnv: requireEnv('NODE_ENV'),
    logLevel: requireEnv('LOG_LEVEL'),

    // Database  
    databaseUrl: requireEnv('DATABASE_URL'),

    // Redis
    redisUrl: requireEnv('REDIS_URL'),

    // Auth
    jwtSecret: requireEnv('JWT_SECRET'),

    // URLs
    frontendUrl: requireEnv('FRONTEND_URL'),
    appUrl: requireEnv('APP_URL'),
    shareDomain: optionalEnv('SHARE_DOMAIN'),

    // SMTP
    smtpHost: requireEnv('SMTP_HOST'),
    smtpPort: requireEnvNumber('SMTP_PORT'),
    smtpUser: requireEnv('SMTP_USER'),
    smtpPassword: requireEnv('SMTP_PASSWORD'),
    smtpFrom: requireEnv('SMTP_FROM'),
    smtpFromName: requireEnv('SMTP_FROM_NAME'),

    // Encryption
    storageEncryptionKey: requireEnv('STORAGE_ENCRYPTION_KEY'),
    storageEncryptionKeyV2: requireEnv('STORAGE_ENCRYPTION_KEY_V2'),

    // Streaming
    streamSecret: requireEnv('STREAM_SECRET'),

    // Payment Gateway
    pakasirSlug: requireEnv('PAKASIR_SLUG'),
    pakasirApiKey: requireEnv('PAKASIR_API_KEY'),

    // Webhook Security
    webhookSecret: requireEnv('WEBHOOK_SECRET'),

    // Storage (optional — not all deployments have custom S3 domain)
    s3CustomDomain: optionalEnv('AWS_S3_CUSTOM_DOMAIN'),
  }

  // ─── Validation Rules ──────────────────────────────────────────────
  if (config.storageEncryptionKey.length !== 64) {
    throw new Error('STORAGE_ENCRYPTION_KEY must be a 64-character hex string')
  }
  if (config.storageEncryptionKeyV2.length !== 64) {
    throw new Error('STORAGE_ENCRYPTION_KEY_V2 must be a 64-character hex string')
  }
  if (config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }

  logger.info({
    event: 'config_loaded',
    nodeEnv: config.nodeEnv,
    port: config.port,
    frontendUrl: config.frontendUrl,
  })

  _config = config
  return config
}

/**
 * Access the loaded config. Throws if loadConfig() hasn't been called yet.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    throw new Error('Config not loaded. Call loadConfig() first from your entry point.')
  }
  return _config
}

/**
 * Shorthand alias for getConfig()
 */
export const env = new Proxy({} as AppConfig, {
  get(_target, prop: string) {
    return getConfig()[prop as keyof AppConfig]
  }
})
