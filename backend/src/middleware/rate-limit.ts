import { redisManager } from '../utils/redis'
import { logger } from '../utils/logger'

export interface RateLimitConfig {
  /** Redis key prefix, e.g. 'rl:login' */
  prefix: string
  /** Maximum allowed requests in the window */
  maxRequests: number
  /** Window duration in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetIn: number // seconds until window resets
  total: number
}

/**
 * Redis-based sliding window rate limiter.
 *
 * Uses a simple INCR + EXPIRE pattern for efficiency.
 * Key format: `{prefix}:{identifier}`
 */
export async function checkRateLimit(
  config: RateLimitConfig,
  identifier: string,
): Promise<RateLimitResult> {
  const redis = await redisManager.getClient()
  const key = `${config.prefix}:${identifier}`

  try {
    const current = await redis.incr(key)

    // Set TTL on first request in the window
    if (current === 1) {
      await redis.expire(key, config.windowSeconds)
    }

    const ttl = await redis.ttl(key)
    const remaining = Math.max(0, config.maxRequests - current)
    const allowed = current <= config.maxRequests

    if (!allowed) {
      logger.warn({
        event: 'rate_limit_exceeded',
        data: {
          prefix: config.prefix,
          identifier,
          current,
          max: config.maxRequests,
          resetIn: ttl,
        },
      })
    }

    return {
      allowed,
      remaining,
      resetIn: ttl > 0 ? ttl : config.windowSeconds,
      total: config.maxRequests,
    }
  } catch (err) {
    // If Redis fails, allow the request (fail-open)
    logger.error({
      event: 'rate_limit_error',
      error: {
        message: err instanceof Error ? err.message : String(err),
        name: 'RateLimitError',
      },
    })
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetIn: config.windowSeconds,
      total: config.maxRequests,
    }
  }
}

// ─── Preset Configs ────────────────────────────────────────────────────────────

/** Register: 5 attempts per 15 minutes per IP */
export const REGISTER_LIMIT: RateLimitConfig = {
  prefix: 'rl:register',
  maxRequests: 5,
  windowSeconds: 15 * 60,
}

/** Login: 10 attempts per 15 minutes per IP */
export const LOGIN_LIMIT: RateLimitConfig = {
  prefix: 'rl:login',
  maxRequests: 10,
  windowSeconds: 15 * 60,
}

/** Email send: 3 emails per 15 minutes per email address */
export const EMAIL_LIMIT: RateLimitConfig = {
  prefix: 'rl:email',
  maxRequests: 3,
  windowSeconds: 15 * 60,
}
