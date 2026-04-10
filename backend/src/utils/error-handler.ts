/**
 * Enhanced Error Handling System
 * Provides custom error types, error classification, and recovery strategies
 */

import { error, errorCodes } from './response'
import { logger } from './logger'

// ─── Custom Error Classes ────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
    public context?: Record<string, any>
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }

  toResponse() {
    return error(this.code, this.message)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(errorCodes.INVALID_INPUT, message, 400, true, context)
    this.name = 'ValidationError'
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(errorCodes.INVALID_CREDENTIALS, message, 401, true, context)
    this.name = 'AuthenticationError'
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: Record<string, any>) {
    super('FORBIDDEN', message, 403, true, context)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(errorCodes.NOT_FOUND, `${resource} not found`, 404, true)
    this.name = 'NotFoundError'
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>) {
    super(errorCodes.RATE_LIMIT_EXCEEDED, message, 429, true, context)
    this.name = 'RateLimitError'
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    public isRetryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(
      errorCodes.INTERNAL_ERROR,
      `${service} error: ${message}`,
      502,
      true,
      { service, ...context }
    )
    this.name = 'ExternalServiceError'
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(errorCodes.INTERNAL_ERROR, `Database error: ${message}`, 500, false, context)
    this.name = 'DatabaseError'
  }
}

export class StorageError extends AppError {
  constructor(
    message: string,
    public isRetryable: boolean = true,
    context?: Record<string, any>
  ) {
    super(errorCodes.STORAGE_UPLOAD_FAILED, message, 502, true, context)
    this.name = 'StorageError'
  }
}

// ─── Error Classification ─────────────────────────────────────────────────

export type ErrorCategory =
  | 'validation'       // Input validation errors
  | 'authentication'   // Auth failures
  | 'authorization'    // Permission errors
  | 'not_found'        // Resource not found
  | 'rate_limit'       // Rate limiting
  | 'external_service' // Third-party service failures
  | 'database'         // Database issues
  | 'storage'          // Storage service issues
  | 'internal'         // Unexpected server errors
  | 'network'          // Network connectivity issues

export function classifyError(err: unknown): ErrorCategory {
  if (err instanceof AppError) {
    if (err instanceof ValidationError) return 'validation'
    if (err instanceof AuthenticationError) return 'authentication'
    if (err instanceof AuthorizationError) return 'authorization'
    if (err instanceof NotFoundError) return 'not_found'
    if (err instanceof RateLimitError) return 'rate_limit'
    if (err instanceof ExternalServiceError) return 'external_service'
    if (err instanceof DatabaseError) return 'database'
    if (err instanceof StorageError) return 'storage'
    return 'internal'
  }

  if (err instanceof Error) {
    const message = err.message.toLowerCase()
    const name = err.constructor.name.toLowerCase()

    if (message.includes('network') || message.includes('timeout') || name.includes('timeout')) {
      return 'network'
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation'
    }
    if (message.includes('database') || message.includes('query')) {
      return 'database'
    }
  }

  return 'internal'
}

// ─── Error Recovery Strategies ─────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors: string[]
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'SERVICE_UNAVAILABLE']
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs
  )
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * exponentialDelay
  return Math.floor(exponentialDelay + jitter)
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: string
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config }
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      const errorCategory = classifyError(err)
      const shouldRetry =
        attempt < finalConfig.maxAttempts &&
        (err instanceof ExternalServiceError || err instanceof StorageError || errorCategory === 'network')

      if (!shouldRetry) {
        logger.warn({
          event: 'retry_not_retryable',
          attempt,
          context,
          error: lastError.message,
          category: errorCategory
        })
        throw err
      }

      const delay = calculateDelay(attempt, finalConfig)

      logger.warn({
        event: 'retry_attempt',
        attempt,
        maxAttempts: finalConfig.maxAttempts,
        delayMs: delay,
        context,
        error: lastError.message,
        category: errorCategory
      })

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  logger.error({
    event: 'retry_exhausted',
    context,
    error: lastError?.message
  })

  throw lastError!
}

// ─── Error Context Enhancement ─────────────────────────────────────────────

export interface ErrorContext {
  operation?: string
  userId?: string
  resourceId?: string
  timestamp: string
  category: ErrorCategory
  correlationId?: string
  stack?: string
}

/**
 * Enhance error with additional context for debugging
 */
export function enhanceError(err: unknown, context: Partial<ErrorContext>): AppError {
  const errorContext: ErrorContext = {
    timestamp: new Date().toISOString(),
    category: classifyError(err),
    ...context
  }

  if (err instanceof AppError) {
    err.context = { ...err.context, ...errorContext }
    return err
  }

  if (err instanceof Error) {
    const appError = new AppError(
      errorCodes.INTERNAL_ERROR,
      err.message,
      500,
      false,
      errorContext
    )
    appError.stack = err.stack
    return appError
  }

  return new AppError(
    errorCodes.INTERNAL_ERROR,
    String(err),
    500,
    false,
    errorContext
  )
}

// ─── Error Logging Helper ─────────────────────────────────────────────────

export function logError(err: unknown, additionalContext?: Record<string, any>) {
  const errorObj = err instanceof Error ? err : new Error(String(err))
  const category = classifyError(err)

  const logData = {
    event: 'application_error',
    category,
    ...additionalContext,
    error: {
      message: errorObj.message,
      name: errorObj.name,
      stack: errorObj.stack,
    },
  }

  // Use different log levels based on error category
  if (category === 'internal' || category === 'database') {
    logger.error(logData)
  } else if (category === 'external_service' || category === 'network') {
    logger.warn(logData)
  } else {
    logger.info(logData)
  }
}

// ─── Safe Async Wrapper ───────────────────────────────────────────────────

/**
 * Wrap async functions to always return AppError
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<[T | null, AppError | null]> {
  try {
    const result = await fn()
    return [result, null]
  } catch (err) {
    const appError = err instanceof AppError
      ? err
      : enhanceError(err, { operation: context })
    logError(appError, { context })
    return [null, appError]
  }
}

// ─── Validation Helper ────────────────────────────────────────────────────

export function assertRequired<T>(
  value: T | null | undefined,
  fieldName: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${fieldName} is required`)
  }
}

export function assertCondition(
  condition: boolean,
  message: string,
  context?: Record<string, any>
) {
  if (!condition) {
    throw new ValidationError(message, context)
  }
}