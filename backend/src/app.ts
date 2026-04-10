import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { rateLimit } from 'elysia-rate-limit'
import { createHash } from 'crypto'
import { authRoutes, videoRoutes, videoStreamingRoutes, billingRoutes, publicBillingRoutes, adminRoutes, folderRoutes, folderStreamingRoutes, publicBlogRoutes, adRoutes, domainRoutes, analyticsRoutes } from './routes'
import { logger, logEvents } from './utils/logger'
import { GB } from './utils/constants'
import { loadApiRuntimeConfig } from './config/runtime'

const { frontendUrl, port } = loadApiRuntimeConfig()

// Type for request store to track timing
interface RequestStore {
  requestStart?: number
}

const app = new Elysia()
  .use(cors({
    origin: frontendUrl,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }))
  // --- Rate Limiting System ---
  // Separate tiers for guests (strict) and authenticated users (generous).
  // Dashboard pages load 10+ video cards simultaneously, each needing
  // GET /videos/:id + GET /v/:id/thumbnail = 20+ requests in the initial burst.

  // Tier 1: Burst Protection — prevent rapid spikes from bots/abuse
  .use(rateLimit({
    duration: 10000, // 10s window
    max: 150,        // 15 req/s average — handles dashboard page loads with many video cards
    generator: (req: Request) => {
      const auth = req.headers.get('authorization')
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'anon'
      if (auth?.startsWith('Bearer ')) {
        const hash = createHash('sha1').update(auth.slice(7)).digest('hex')
        return `burst:user:${hash}`
      }
      return `burst:guest:${ip}`
    },
    // Skip rate limiting for streaming segments — HLS player rapidly fetches .ts files
    skip: (req: Request) => {
      const url = new URL(req.url)
      return url.pathname.includes('/hls/') || url.pathname.endsWith('/thumbnail')
    },
  }))

  // Sustained Application Limit
  .use(rateLimit({
    duration: 60000, 
    max: 3000,
    generator: (req: Request) => {
      const auth = req.headers.get('authorization')
      const ip = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'anon'
      if (auth?.startsWith('Bearer ')) {
        const hash = createHash('sha1').update(auth.slice(7)).digest('hex')
        return `sustained:user:${hash}`
      }
      return `sustained:guest:${ip}`
    },
    // Skip rate limits for HLS segments AND thumbnails
    // Dashboard loads many thumbnails; HLS rapidly fetches .ts segments.
    skip: (req: Request) => {
      const url = new URL(req.url)
      return url.pathname.includes('/v/') || url.pathname.endsWith('/thumbnail')
    },
  }))

  // ── Global Error Diagnostics ──
  .onError(({ code, error: err, request }) => {
    // Handle different error types safely (rate-limit errors have different structure)
    const errorMessage = typeof err === 'string' ? err : (err as any)?.message || 'An unexpected server error occurred'

    logger.error({
      event: 'server_exception',
      code,
      url: request.url,
      error: errorMessage,
      stack: (err as any)?.stack,
    })

    // Return standard error response
    if (code === 'NOT_FOUND') return { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }

    const errorCode = (err as any)?.code || 'INTERNAL_ERROR'

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  })

  // ── Request-level logging (visible at LOG_LEVEL=debug) ──
  .onRequest(({ request, store }) => {
    (store as RequestStore).requestStart = Date.now()

    // Skip logging for high-frequency polling endpoints
    const url = new URL(request.url)
    const skipLog = url.pathname === '/videos/queue-status' ||
                     url.pathname.match(/^\/videos\/[a-f0-9-]+$/) ||  // GET /videos/:id polling
                     url.pathname.match(/^\/v\/[^/]+\/thumbnail$/)

    if (!skipLog) {
      logger.debug({
        event: 'http_request',
        method: request.method,
        url: request.url,
        auth: request.headers.get('authorization') ? 'Bearer ***' : 'none',
      })
    }
  })

  // Log Rate Limit Triggers
  .onAfterHandle(({ set, request, store }) => {
    const responseTimeMs = (store as RequestStore).requestStart ? Date.now() - (store as RequestStore).requestStart! : undefined

    if (set.status === 429) {
      logger.warn({
        event: 'rate_limit_triggered',
        url: request.url,
        ip: request.headers.get('x-forwarded-for') || 'direct',
        ua: request.headers.get('user-agent')
      })
    }

    // Log slow requests (>1s) at warn level for visibility
    if (responseTimeMs && responseTimeMs > 1000) {
      logger.warn({
        event: 'http_slow_request',
        method: request.method,
        url: request.url,
        responseTimeMs,
        statusCode: set.status,
      })
    }
  })
  .use(authRoutes)
  .use(publicBillingRoutes)
  .use(billingRoutes)
  .use(adminRoutes)
  .use(videoRoutes)
  .use(videoStreamingRoutes)
  .use(folderRoutes)
  .use(folderStreamingRoutes)
  .use(publicBlogRoutes)
  .use(adRoutes)
  .use(domainRoutes)
  .use(analyticsRoutes)
  .get('/', () => ({
    message: 'Vercelplay API',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /auth/register',
        verify: 'GET /auth/verify?token=xxx',
        login: 'POST /auth/login',
      },
    },
  }))
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }))

// Start server
app.listen({
  port,
  // 5.5GB — must exceed the 5GB video limit to account for multipart overhead
  maxRequestBodySize: 5.5 * GB,
}, () => {
  logger.info({
    event: logEvents.SERVER_START,
    data: { port },
  })
  console.log(`🦊 Vercelplay API running on http://localhost:${port}`)
  console.log(`📚 Documentation: http://localhost:${port}`)
})

export { app }
