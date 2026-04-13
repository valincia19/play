import { logger, logEvents } from './logger'

// Security error handling utility
export class SecurityError {
  // Sanitize error messages for user responses
  static sanitizeError(error: unknown, userMessage = 'An error occurred'): {
    userMessage: string
    internalError: string | null
    shouldLog: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  } {
    if (error instanceof Error) {
      // Log internal details for debugging
      logger.error({
        event: logEvents.SECURITY_ERROR,
        internalError: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      })

      // Return generic message to user
      return {
        userMessage,
        internalError: error.message,
        shouldLog: true,
        logLevel: 'error'
      }
    }

    // Handle non-error objects
    if (error && typeof error === 'object') {
      // Log the object details
      logger.error({
        event: logEvents.SECURITY_ERROR,
        internalError: JSON.stringify(error),
        timestamp: new Date().toISOString()
      })

      return {
        userMessage,
        internalError: JSON.stringify(error),
        shouldLog: true,
        logLevel: 'error'
      }
    }

    // Handle primitive errors
    logger.warn({
      event: logEvents.SECURITY_ERROR,
      internalError: String(error),
      timestamp: new Date().toISOString()
    })

    return {
      userMessage,
      internalError: String(error),
      shouldLog: true,
      logLevel: 'warn'
    }
  }

  // Handle authentication security events
  static logAuthSecurity(event: string, details: {
    userId?: string
    email?: string
    ip?: string
    userAgent?: string
    action?: string
    success?: boolean
    reason?: string
  }) {
    // Hash sensitive data for privacy
    const sanitized = {
      ...details,
      email: details.email ? this.hashEmail(details.email) : undefined,
      userId: details.userId ? this.hashId(details.userId) : undefined,
    }

    logger.info({
      event: `auth_security_${event}`,
      ...sanitized,
      timestamp: new Date().toISOString()
    })
  }

  // Log security violations
  static logSecurityViolation(event: string, details: {
    violation: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    ip?: string
    endpoint?: string
    userAgent?: string
    userId?: string
  }) {
    logger.warn({
      event: 'security_violation',
      violationType: event,
      severity: details.severity,
      endpoint: details.endpoint,
      ip: details.ip,
      userId: details.userId ? this.hashId(details.userId) : undefined,
      userAgent: details.userAgent ? this.truncateUserAgent(details.userAgent) : undefined,
      timestamp: new Date().toISOString()
    })
  }

  // Private helper functions
  private static hashEmail(email: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(email).digest('hex').substring(0, 8)
  }

  private static hashId(id: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(id).digest('hex').substring(0, 8)
  }

  private static truncateUserAgent(userAgent: string): string {
    return userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent
  }
}

// Common security error messages
export const SECURITY_MESSAGES = {
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_LOCKED: 'Account temporarily locked due to multiple failed attempts',
  INVALID_TOKEN: 'Invalid or expired token',
  PERMISSION_DENIED: 'You do not have permission to perform this action',
  MALICIOUS_INPUT: 'Invalid input detected',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit',
  UNSUPPORTED_FILE_TYPE: 'File type not supported',
  SECURITY_SCAN_FAILED: 'Security scan failed. Please try again',
  ACCOUNT_SUSPENDED: 'Your account has been suspended',
  INVALID_SESSION: 'Session expired. Please log in again',
  CSRF_TOKEN_INVALID: 'Security token expired. Please refresh and try again',
  PASSWORD_POLICY_VIOLATION: 'Password does not meet security requirements',
  EMAIL_VERIFICATION_REQUIRED: 'Please verify your email address first',
  ACCOUNT_DELETED: 'Account has been deleted'
}

// Security error types
export const SECURITY_ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  MALICIOUS_INPUT: 'MALICIOUS_INPUT',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE: 'UNSUPPORTED_FILE_TYPE',
  SECURITY_SCAN_FAILED: 'SECURITY_SCAN_FAILED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  INVALID_SESSION: 'INVALID_SESSION',
  CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
  PASSWORD_POLICY_VIOLATION: 'PASSWORD_POLICY_VIOLATION',
  EMAIL_VERIFICATION_REQUIRED: 'EMAIL_VERIFICATION_REQUIRED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED'
}