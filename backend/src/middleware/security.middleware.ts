import { Elysia } from 'elysia'
import { logger, logEvents } from '../utils/logger'
import { createHash } from 'crypto'

// Rate limiting by IP with different tiers
export const createSecurityMiddleware = (app: Elysia) => {
  // Enhanced rate limiting for sensitive endpoints
  const sensitiveEndpoints = [
    '/auth/login',
    '/auth/register',
    '/auth/verify',
    '/forgot-password'
  ]

  // Content-Type validation middleware
  const validateContentType = (request: any) => {
    const contentType = request.headers.get('content-type')
    const method = request.method

    // Only validate POST, PUT, PATCH methods
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      if (!contentType?.includes('application/json')) {
        logger.warn({
          event: 'invalid_content_type',
          url: request.url,
          contentType: contentType,
          ip: request.headers.get('x-forwarded-for') || 'unknown'
        })
        return false
      }
    }
    return true
  }

  // Email hash for privacy logging
  const getEmailHash = (email: string | undefined) => {
    if (!email) return 'none'
    return createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 8)
  }

  // User agent truncation for privacy
  const truncateUserAgent = (ua: string | null) => {
    if (!ua) return 'none'
    return ua.substring(0, 100) + (ua.length > 100 ? '...' : '')
  }

  return app
    // Request logging with privacy protection
    .onRequest(({ request, store }) => {
      // Timing for slow request detection
      (store as { startTime?: number }).startTime = Date.now()

      // Log request with privacy protection
      logger.info({
        event: 'http_request_secure',
        method: request.method,
        url: request.url,
        // Hash emails instead of logging them directly
        email: getEmailHash(request.headers.get('x-user-email') || undefined),
        ip: request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown',
        // Truncate user agent for privacy
        userAgent: truncateUserAgent(request.headers.get('user-agent'))
      })

      // Validate content type for JSON endpoints
      if (!validateContentType(request)) {
        logger.warn({
          event: 'invalid_content_type',
          url: request.url,
          contentType: request.headers.get('content-type'),
          ip: request.headers.get('x-forwarded-for') || 'unknown'
        })
      }
    })
    // Request size limits per endpoint type
    .onBeforeHandle(({ request, set }) => {
      const url = new URL(request.url)

      // Lower limits for non-file uploads
      const contentLength = request.headers.get('content-length')
      const sizeInMB = contentLength ? parseInt(contentLength) / 1024 / 1024 : 0

      // Stricter limits for non-upload endpoints
      if (!url.pathname.includes('/upload')) {
        if (sizeInMB > 10) { // 10MB limit for non-upload
          set.status = 413
          logger.warn({
            event: 'request_too_large',
            url: request.url,
            sizeMB: sizeInMB,
            ip: request.headers.get('x-forwarded-for') || 'unknown'
          })
          return { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request payload is too large' } }
        }
      }
    })
    // Rate limiting for sensitive endpoints
    .derive({ as: 'global' }, ({ request }) => {
      const url = new URL(request.url)
      const ip = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'unknown'

      // Return enhanced rate limiting config for sensitive endpoints
      if (sensitiveEndpoints.some(endpoint => url.pathname.startsWith(endpoint))) {
        return {
          rateLimitTier: 'sensitive',
          ip: ip
        }
      }
      return {
        rateLimitTier: 'default',
        ip: ip
      }
    })
}

// Additional security utilities
export const securityUtils = {
  // Sanitize user input to prevent XSS
  sanitizeInput: (input: any): any => {
    if (typeof input !== 'string') return input

    // Remove potentially dangerous characters
    return input
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
  },

  // Check if input looks malicious
  isMaliciousInput: (input: string): boolean => {
    const patterns = [
      /<script/i,
      /javascript:/i,
      /onload=/i,
      /onclick=/i,
      /<iframe/i,
      /onerror=/i,
      /eval\(/i,
      /document\./i,
      /window\./i
    ]

    return patterns.some(pattern => pattern.test(input))
  },

  // Validate file extensions for uploads
  validateFileExtension: (filename: string, allowed: string[]): boolean => {
    const ext = filename.toLowerCase().split('.').pop() || ''
    return allowed.includes(ext)
  }
}