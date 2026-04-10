import { logger, logEvents } from './logger'

/**
 * Shared Redis client singleton.
 * Used across the app for rate limiting, token storage, etc.
 */
class RedisManager {
  private client: any = null
  private subClient: any = null // Dedicated for PUB/SUB
  private initialized = false

  async getClient(): Promise<any> {
    if (this.client && this.initialized) return this.client

    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required')
    }

    const Redis = require('ioredis')
    
    // Default options to prevent excessive retries and clean up logs
    const redisOptions = {
      family: 4, // Force IPv4 to avoid noisy AggregateError spam in Node 20 / Bun
      retryStrategy: (times: number) => {
        return Math.min(times * 1000, 5000) // Increase delay up to 5s
      },
      showFriendlyErrorStack: true
    }
    
    this.client = new Redis(redisUrl, redisOptions)
    this.subClient = new Redis(redisUrl, redisOptions) // Must be separated for pub/sub rules
    this.initialized = true

    const handleError = (context: string) => (err: any) => {
      // If it's a connection refused, log a simplified message instead of full stack
      if (err.code === 'ECONNREFUSED' || (err.name === 'AggregateError' && err.message.includes('ECONNREFUSED'))) {
        logger.error({ event: logEvents.REDIS_ERROR, message: `${context}: Redis connection refused (is Redis running?)` })
      } else {
        logger.error({ event: logEvents.REDIS_ERROR, message: `${context}: ${err.message}` })
      }
    }

    this.client.on('error', handleError('MainClient'))
    this.subClient.on('error', handleError('SubClient'))

    return this.client
  }

  /**
   * Returns a fresh Redis connection for BullMQ/Dedicated tasks.
   */
  duplicate(): any {
    const Redis = require('ioredis')
    const redisUrl = process.env.REDIS_URL
    if (!redisUrl) throw new Error('REDIS_URL missing')
    
    const client = new Redis(redisUrl, { 
      family: 4,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 1000, 5000)
    }) // Required for BullMQ
    
    client.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED' || (err.name === 'AggregateError' && err.message.includes('ECONNREFUSED'))) {
        logger.error({ event: logEvents.REDIS_ERROR, message: 'WorkerClient: Redis connection refused (is Redis running?)' })
      } else {
        logger.error({ event: logEvents.REDIS_ERROR, message: `WorkerClient: ${err.message}` })
      }
    })
    
    return client
  }

  // --- 1. SMART CACHING ---
  async getOrSet<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    const redis = await this.getClient()
    try {
      const cached = await redis.get(key)
      if (cached) return JSON.parse(cached) as T
    } catch (e) {
      // Just fallback to fetcher if redis parsing fails
    }
    
    const freshData = await fetcher()
    await this.set(key, freshData, ttlSeconds)
    return freshData
  }

  async set(key: string, value: any, ttlSeconds: number) {
    const redis = await this.getClient()
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value))
    } catch (e) {}
  }

  async del(key: string) {
    const redis = await this.getClient()
    await redis.del(key)
  }

  // Delete exactly matching keys or scan them
  async delPattern(pattern: string) {
    const redis = await this.getClient()
    const keys = await redis.keys(pattern)
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  }

  // --- 2. PUB / SUB EVENT SYSTEM ---
  async publish(channel: string, message: any) {
    const redis = await this.getClient()
    await redis.publish(channel, JSON.stringify(message))
  }

  async subscribe(channel: string, callback: (message: any) => void) {
    await this.getClient() // Ensure init
    await this.subClient.subscribe(channel)
    this.subClient.on('message', (ch: string, rawMessage: string) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(rawMessage))
        } catch (e) {
          callback(rawMessage)
        }
      }
    })
  }

  // --- 3. QUEUE SYSTEM (For workers) ---
  async rpush(key: string, items: any[]) {
    const redis = await this.getClient()
    if (items.length > 0) {
      await redis.rpush(key, ...items.map((i: any) => JSON.stringify(i)))
    }
  }

  async lpop(key: string, count: number = 100): Promise<any[]> {
    const redis = await this.getClient()
    const rawItems: string[] = await redis.lpop(key, count)
    if (!rawItems) return []
    return rawItems.map(item => JSON.parse(item))
  }
}

export const redisManager = new RedisManager()
