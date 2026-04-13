import { loadConfig } from './config/env'

// Initialize and validate config first
loadConfig()

import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { rateLimit } from 'elysia-rate-limit'
import { createHash } from 'crypto'
import { authRoutes, videoRoutes, videoStreamingRoutes, billingRoutes, publicBillingRoutes, adminRoutes, folderRoutes, folderStreamingRoutes, publicBlogRoutes, adRoutes, domainRoutes, analyticsRoutes, errorMonitoringRoutes } from './routes'
import { scheduledMonitoring } from './utils/error-dashboard'
import { logger, logEvents } from './utils/logger'
import { GB } from './utils/constants'
import { loadApiRuntimeConfig } from './config/runtime'
import { env } from './config/env'
import { createSecurityMiddleware } from './middleware/security.middleware'
import { SECURITY, securityMiddlewareConfig } from './config/security'

const { frontendUrl, port } = loadApiRuntimeConfig()

// Type for request store to track timing
interface RequestStore {
  requestStart?: number
}

const app = new Elysia()
  // Apply security middleware first
  .use(createSecurityMiddleware)
  .use(cors({
    origin: [
      frontendUrl,
      // Share domain (verply.net) also needs API access for video playback
      env.shareDomain ? `https://${env.shareDomain}` : '',
    ].filter(Boolean),
    methods: SECURITY.CORS.allowedMethods,
    allowedHeaders: SECURITY.CORS.allowedHeaders,
    credentials: SECURITY.CORS.credentials,
  }))
  // --- Security Headers ---
  .onBeforeHandle(({ set, request }) => {
    // Apply security headers configuration
    if (securityMiddlewareConfig.headers.enabled) {
      Object.entries(SECURITY.HEADERS).forEach(([key, value]) => {
        set.headers[key] = value
      })
    }

    // HTTPS enforcement
    if (securityMiddlewareConfig.httpsEnforcement.enabled) {
      const url = new URL(request.url)
      const forwardProto = request.headers.get('x-forwarded-proto')
      if (url.protocol === 'http:' && forwardProto !== 'https') {
        const httpsUrl = `https://${url.host}${url.pathname}${url.search}`
        return Response.redirect(httpsUrl, securityMiddlewareConfig.httpsEnforcement.statusCode)
      }
    }
  })
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
      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'anon'
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
      const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'anon'
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
    // Narrow down the unknown error type safely
    const isObjectError = typeof err === 'object' && err !== null
    const errObj = isObjectError ? (err as Record<string, unknown>) : {}

    // Our error() utility throws plain objects: { success: false, error: { code, message } }
    // Detect and return them directly without logging them as "UNKNOWN" crashes
    if (isObjectError && 'success' in errObj && errObj.success === false) {
      return errObj
    }

    // Determine a readable error message
    let errorMessage = 'An unexpected server error occurred'
    if (typeof err === 'string') {
      errorMessage = err
    } else if (err instanceof Error) {
      errorMessage = err.message
    } else if (isObjectError && typeof errObj.message === 'string') {
      errorMessage = errObj.message
    }

    // Build diagnostic payload
    const errorDetail: Record<string, unknown> = {
      event: 'server_exception',
      code,
      url: request.url,
      error: errorMessage,
    }

    // Extract stack traces and metadata
    if (err instanceof Error) {
      errorDetail.stack = err.stack
      errorDetail.errorName = err.name
    } else if (isObjectError) {
      errorDetail.errorKeys = Object.keys(errObj)
      try {
        // Prevent crashes on circular objects like AWS SDK errors
        errorDetail.rawError = JSON.stringify(errObj, null, 0).slice(0, 500)
      } catch (safeErr) {
        errorDetail.rawError = '[Failed to serialize object - circular reference]'
      }
    }

    logger.error(errorDetail)

    // Standardize HTTP response
    if (code === 'NOT_FOUND') {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Resource not found' } }
    }

    const errorCode = (isObjectError && typeof errObj.code === 'string') ? errObj.code : 'INTERNAL_ERROR'

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
        ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'direct',
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
  .use(errorMonitoringRoutes) // Error monitoring dashboard routes
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

  // Start error monitoring system
  try {
    scheduledMonitoring.start()
    console.log(`📊 Error monitoring system started`)
  } catch (error) {
    logger.error({
      event: 'monitoring_start_failed',
      error: error instanceof Error ? error.message : String(error)
    })
  }
})

export { app }
