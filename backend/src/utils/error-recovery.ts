/**
 * Automated Error Recovery System
 * Provides self-healing capabilities for common error scenarios
 */

import { logger } from './logger'
import { CircuitBreakerRegistry, CircuitState } from './circuit-breaker'
import { classifyError, type ErrorCategory } from './error-handler'
import { errorMonitor } from './error-monitor'
import { db } from '../schema/db'
import { redisClient } from './redis'

// ─── Recovery Strategies ─────────────────────────────────────────────────

interface RecoveryStrategy {
  name: string
  canRecover: (error: any) => boolean
  recover: (error: any, context?: any) => Promise<boolean>
  maxAttempts: number
  cooldownMs: number
}

class RecoveryManager {
  private static instance: RecoveryManager
  private recoveryAttempts: Map<string, number[]> = new Map()
  private lastAttemptTime: Map<string, number> = new Map()

  private constructor() {
    this.initializeStrategies()
  }

  static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager()
    }
    return RecoveryManager.instance
  }

  private strategies: RecoveryStrategy[] = []

  private initializeStrategies(): void {
    // Database connection recovery
    this.strategies.push({
      name: 'database_connection',
      canRecover: (error) => {
        const errorMessage = error?.message?.toLowerCase() || ''
        return errorMessage.includes('connection') ||
               errorMessage.includes('timeout') ||
               errorMessage.includes('pool') ||
               error?.code === 'ECONNREFUSED'
      },
      recover: async (error) => {
        try {
          // Test database connection
          await db.execute('SELECT 1')

          logger.info({
            event: 'recovery_database_success',
            message: 'Database connection recovered'
          })

          return true
        } catch (testError) {
          logger.warn({
            event: 'recovery_database_failed',
            error: testError instanceof Error ? testError.message : String(testError)
          })
          return false
        }
      },
      maxAttempts: 3,
      cooldownMs: 30000 // 30 seconds
    })

    // Redis connection recovery
    this.strategies.push({
      name: 'redis_connection',
      canRecover: (error) => {
        const errorMessage = error?.message?.toLowerCase() || ''
        return errorMessage.includes('redis') ||
               errorMessage.includes('cache') ||
               error?.code === 'CONNECTION_BROKEN'
      },
      recover: async () => {
        try {
          // Test Redis connection
          await (await redisClient()).ping()

          logger.info({
            event: 'recovery_redis_success',
            message: 'Redis connection recovered'
          })

          return true
        } catch (testError) {
          logger.warn({
            event: 'recovery_redis_failed',
            error: testError instanceof Error ? testError.message : String(testError)
          })
          return false
        }
      },
      maxAttempts: 5,
      cooldownMs: 15000 // 15 seconds
    })

    // Circuit breaker recovery
    this.strategies.push({
      name: 'circuit_breaker',
      canRecover: (error) => {
        return error?.message?.includes('Circuit breaker is OPEN')
      },
      recover: async (error, context) => {
        try {
          const registry = CircuitBreakerRegistry.getInstance()
          const serviceName = context?.serviceName

          if (serviceName) {
            // Try to reset the circuit breaker
            registry.reset(serviceName)

            logger.info({
              event: 'recovery_circuit_breaker_success',
              service: serviceName
            })

            return true
          }

          return false
        } catch (testError) {
          logger.warn({
            event: 'recovery_circuit_breaker_failed',
            error: testError instanceof Error ? testError.message : String(testError)
          })
          return false
        }
      },
      maxAttempts: 2,
      cooldownMs: 60000 // 1 minute
    })

    // Memory pressure recovery
    this.strategies.push({
      name: 'memory_pressure',
      canRecover: (error) => {
        const errorMessage = error?.message?.toLowerCase() || ''
        return errorMessage.includes('memory') ||
               errorMessage.includes('heap') ||
               error?.code === 'ENOMEM'
      },
      recover: async () => {
        try {
          // Force garbage collection if available
          if (global.gc) {
            global.gc()
          }

          // Clear caches
          this.clearCaches()

          logger.info({
            event: 'recovery_memory_success',
            message: 'Memory pressure relieved'
          })

          return true
        } catch (testError) {
          logger.warn({
            event: 'recovery_memory_failed',
            error: testError instanceof Error ? testError.message : String(testError)
          })
          return false
        }
      },
      maxAttempts: 3,
      cooldownMs: 10000 // 10 seconds
    })

    // Rate limit recovery
    this.strategies.push({
      name: 'rate_limit',
      canRecover: (error) => {
        const errorMessage = error?.message?.toLowerCase() || ''
        return errorMessage.includes('rate limit') ||
               error?.code === 'RATE_LIMIT_EXCEEDED'
      },
      recover: async (error, context) => {
        try {
          // Wait for rate limit reset
          const waitTime = context?.retryAfter || 5000

          logger.info({
            event: 'recovery_rate_limit_wait',
            waitTimeMs: waitTime
          })

          await new Promise(resolve => setTimeout(resolve, waitTime))

          return true
        } catch (testError) {
          return false
        }
      },
      maxAttempts: 2,
      cooldownMs: 5000 // 5 seconds
    })
  }

  /**
   * Attempt to recover from an error
   */
  async attemptRecovery(error: any, context?: any): Promise<boolean> {
    const correlationId = errorMonitor.generateCorrelationId()

    for (const strategy of this.strategies) {
      if (!strategy.canRecover(error)) {
        continue
      }

      const strategyKey = `${strategy.name}_${correlationId}`
      const attempts = this.recoveryAttempts.get(strategyKey) || []
      const lastAttempt = this.lastAttemptTime.get(strategy.name) || 0
      const now = Date.now()

      // Check if we should attempt recovery
      if (attempts.length >= strategy.maxAttempts) {
        logger.warn({
          event: 'recovery_max_attempts_reached',
          strategy: strategy.name,
          attempts: attempts.length
        })
        continue
      }

      if (now - lastAttempt < strategy.cooldownMs) {
        logger.info({
          event: 'recovery_cooldown',
          strategy: strategy.name,
          cooldownRemainingMs: strategy.cooldownMs - (now - lastAttempt)
        })
        continue
      }

      // Attempt recovery
      logger.info({
        event: 'recovery_attempt',
        strategy: strategy.name,
        correlationId
      })

      const success = await this.executeRecovery(strategy, error, context)

      // Record attempt
      attempts.push(now)
      this.recoveryAttempts.set(strategyKey, attempts)
      this.lastAttemptTime.set(strategy.name, now)

      if (success) {
        logger.info({
          event: 'recovery_success',
          strategy: strategy.name,
          correlationId
        })

        // Record successful recovery in error monitor
        errorMonitor.recordError({
          timestamp: new Date().toISOString(),
          category: classifyError(error),
          code: error?.code || 'UNKNOWN',
          message: error?.message || 'Unknown error',
          recovered: true,
          recoveryTime: Date.now() - now,
          correlationId
        })

        return true
      }
    }

    return false
  }

  private async executeRecovery(
    strategy: RecoveryStrategy,
    error: any,
    context?: any
  ): Promise<boolean> {
    try {
      return await strategy.recover(error, context)
    } catch (recoveryError) {
      logger.error({
        event: 'recovery_execution_failed',
        strategy: strategy.name,
        error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
      })
      return false
    }
  }

  private clearCaches(): void {
    // Clear in-memory caches
    this.recoveryAttempts.clear()
    this.lastAttemptTime.clear()

    // Note: Additional cache clearing can be added here
    // for application-specific caches
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(): {
    strategies: string[]
    activeRecoveries: number
    lastRecoveryTime?: number
  } {
    const now = Date.now()
    const recentRecoveries = Array.from(this.lastAttemptTime.entries()).filter(
      ([, time]) => now - time < 300000 // Last 5 minutes
    )

    return {
      strategies: this.strategies.map(s => s.name),
      activeRecoveries: recentRecoveries.length,
      lastRecoveryTime: recentRecoveries.length > 0
        ? Math.max(...recentRecoveries.map(([, time]) => time))
        : undefined
    }
  }
}

// ─── Error Boundary Implementation ───────────────────────────────────────

export class ErrorBoundary {
  private recoveryManager: RecoveryManager
  private fallbackHandlers: Map<ErrorCategory, (error: any) => any> = new Map()

  constructor() {
    this.recoveryManager = RecoveryManager.getInstance()
    this.initializeFallbackHandlers()
  }

  /**
   * Execute operation with error boundary protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    options?: {
      context?: string
      fallback?: () => T | Promise<T>
      timeout?: number
    }
  ): Promise<T> {
    const { context = 'unknown', fallback, timeout = 30000 } = options || {}

    try {
      // Add timeout protection
      const result = await this.withTimeout(operation(), timeout)

      return result
    } catch (error) {
      const category = classifyError(error)

      logger.error({
        event: 'error_boundary_caught',
        context,
        category,
        error: error instanceof Error ? error.message : String(error)
      })

      // Record error in monitor
      errorMonitor.recordError({
        timestamp: new Date().toISOString(),
        category,
        code: error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
        recovered: false,
        correlationId: errorMonitor.generateCorrelationId()
      })

      // Attempt recovery
      const recovered = await this.recoveryManager.attemptRecovery(error, { context })

      if (recovered) {
        // Retry operation after recovery
        try {
          return await this.withTimeout(operation(), timeout)
        } catch (retryError) {
          logger.error({
            event: 'error_boundary_retry_failed',
            context,
            error: retryError instanceof Error ? retryError.message : String(retryError)
          })
        }
      }

      // Use fallback if available
      if (fallback) {
        try {
          const fallbackResult = await fallback()
          logger.info({
            event: 'error_boundary_fallback_success',
            context
          })
          return fallbackResult
        } catch (fallbackError) {
          logger.error({
            event: 'error_boundary_fallback_failed',
            context,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          })
        }
      }

      // Use category-specific fallback
      const categoryFallback = this.fallbackHandlers.get(category)
      if (categoryFallback) {
        try {
          return await categoryFallback(error)
        } catch (categoryFallbackError) {
          logger.error({
            event: 'error_boundary_category_fallback_failed',
            category,
            error: categoryFallbackError instanceof Error ? categoryFallbackError.message : String(categoryFallbackError)
          })
        }
      }

      // If all else fails, rethrow the error
      throw error
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ])
  }

  private initializeFallbackHandlers(): void {
    // Validation errors
    this.fallbackHandlers.set('validation', (error) => {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input provided'
        }
      } as any
    })

    // Not found errors
    this.fallbackHandlers.set('not_found', (error) => {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found'
        }
      } as any
    })

    // Rate limit errors
    this.fallbackHandlers.set('rate_limit', (error) => {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.'
        }
      } as any
    })
  }

  /**
   * Register custom fallback handler for an error category
   */
  registerFallback(category: ErrorCategory, handler: (error: any) => any): void {
    this.fallbackHandlers.set(category, handler)
  }
}

// ─── Graceful Degradation ───────────────────────────────────────────────

export class GracefulDegradation {
  private serviceStatus: Map<string, { available: boolean; lastCheck: number }> = new Map()

  /**
   * Execute operation with graceful degradation
   */
  async executeWithFallback<T>(
    primaryService: () => Promise<T>,
    fallbackServices: (() => Promise<T>)[],
    serviceName: string
  ): Promise<T> {
    const services = [primaryService, ...fallbackServices]

    for (let i = 0; i < services.length; i++) {
      const service = services[i]
      if (!service) continue

      const isPrimary = i === 0

      try {
        const result = await service()

        // Update service status
        this.serviceStatus.set(serviceName + (isPrimary ? '_primary' : `_fallback_${i}`), {
          available: true,
          lastCheck: Date.now()
        })

        if (!isPrimary) {
          logger.warn({
            event: 'graceful_degradation_fallback_used',
            service: serviceName,
            fallbackLevel: i
          })
        }

        return result
      } catch (error) {
        logger.error({
          event: 'graceful_degradation_service_failed',
          service: serviceName,
          level: i,
          error: error instanceof Error ? error.message : String(error)
        })

        // Update service status
        this.serviceStatus.set(serviceName + (isPrimary ? '_primary' : `_fallback_${i}`), {
          available: false,
          lastCheck: Date.now()
        })

        // Continue to next fallback
        continue
      }
    }

    throw new Error(`All services failed for ${serviceName}`)
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName: string): {
    primaryAvailable: boolean
    fallbackAvailable: boolean[]
    lastCheck: number
  } {
    const primaryStatus = this.serviceStatus.get(serviceName + '_primary')
    const fallbackCount = Array.from(this.serviceStatus.keys())
      .filter(key => key.startsWith(serviceName + '_fallback_'))
      .length

    const fallbackAvailable = Array.from({ length: fallbackCount }, (_, i) => {
      const status = this.serviceStatus.get(serviceName + `_fallback_${i}`)
      return status?.available || false
    })

    return {
      primaryAvailable: primaryStatus?.available || false,
      fallbackAvailable,
      lastCheck: primaryStatus?.lastCheck || 0
    }
  }
}

// Export singleton instances
export const recoveryManager = RecoveryManager.getInstance()
export const errorBoundary = new ErrorBoundary()
export const gracefulDegradation = new GracefulDegradation()