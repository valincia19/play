/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by automatically failing fast when a service
 * is experiencing issues, and allowing it to recover when healthy.
 */

import { logger } from './logger'

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation - requests pass through
  OPEN = 'OPEN',         // Circuit is open - requests fail immediately
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number    // Number of failures before opening
  successThreshold: number    // Number of successes to close circuit
  timeoutMs: number          // How long to stay open before testing
  monitoringPeriodMs: number // Time window to count failures
  halfOpenAttempts: number   // Number of attempts allowed in half-open state
}

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 60000,        // 1 minute
  monitoringPeriodMs: 10000, // 10 seconds
  halfOpenAttempts: 3
}

interface CircuitStats {
  failures: number
  successes: number
  lastFailureTime: number
  lastSuccessTime: number
  openedAt: number
  halfOpenAttempts: number
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    openedAt: 0,
    halfOpenAttempts: 0
  }

  constructor(
    private readonly serviceName: string,
    private readonly config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = { ...defaultCircuitBreakerConfig, ...config }
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const state = this.getState()

    if (state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen()
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.serviceName}`)
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    const now = Date.now()

    if (this.state === CircuitState.OPEN) {
      if (now - this.stats.openedAt >= (this.config.timeoutMs!)) {
        this.transitionToHalfOpen()
      }
    }

    return this.state
  }

  /**
   * Get circuit statistics
   */
  getStats() {
    return {
      state: this.state,
      ...this.stats,
      config: this.config
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: 0,
      openedAt: 0,
      halfOpenAttempts: 0
    }

    logger.info({
      event: 'circuit_breaker_reset',
      service: this.serviceName
    })
  }

  private shouldAttemptReset(): boolean {
    const now = Date.now()
    return now - this.stats.openedAt >= (this.config.timeoutMs!)
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN
    this.stats.openedAt = Date.now()

    logger.warn({
      event: 'circuit_breaker_opened',
      service: this.serviceName,
      failures: this.stats.failures,
      threshold: this.config.failureThreshold
    })
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN
    this.stats.halfOpenAttempts = 0

    logger.info({
      event: 'circuit_breaker_half_open',
      service: this.serviceName
    })
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED
    this.stats.failures = 0
    this.stats.halfOpenAttempts = 0

    logger.info({
      event: 'circuit_breaker_closed',
      service: this.serviceName
    })
  }

  private onSuccess(): void {
    const now = Date.now()
    this.stats.lastSuccessTime = now

    if (this.state === CircuitState.HALF_OPEN) {
      this.stats.successes++
      this.stats.halfOpenAttempts++

      if (this.stats.successes >= (this.config.successThreshold!)) {
        this.transitionToClosed()
      }
    } else {
      this.stats.successes++
      // Reset failures on success in closed state
      this.stats.failures = Math.max(0, this.stats.failures - 1)
    }
  }

  private onFailure(): void {
    const now = Date.now()
    this.stats.lastFailureTime = now

    if (this.state === CircuitState.HALF_OPEN) {
      this.stats.halfOpenAttempts++
      this.transitionToOpen()
    } else {
      this.stats.failures++

      if (this.stats.failures >= (this.config.failureThreshold!)) {
        this.transitionToOpen()
      }
    }

    logger.warn({
      event: 'circuit_breaker_failure',
      service: this.serviceName,
      state: this.state,
      failures: this.stats.failures,
      threshold: this.config.failureThreshold
    })
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers for different services
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry
  private breakers: Map<string, CircuitBreaker> = new Map()

  private constructor() {}

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry()
    }
    return CircuitBreakerRegistry.instance
  }

  /**
   * Get or create circuit breaker for a service
   */
  getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, config))
    }
    return this.breakers.get(serviceName)!
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses() {
    return Array.from(this.breakers.entries()).map(([name, breaker]) => ({
      service: name,
      ...breaker.getStats()
    }))
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(breaker => breaker.reset())
  }

  /**
   * Reset specific circuit breaker
   */
  reset(serviceName: string): void {
    const breaker = this.breakers.get(serviceName)
    if (breaker) {
      breaker.reset()
    }
  }
}

/**
 * Circuit breaker decorator for service methods
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor {
  return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value
    const registry = CircuitBreakerRegistry.getInstance()
    const breaker = registry.getBreaker(serviceName, config)

    descriptor.value = async function (this: any, ...args: any[]) {
      return breaker.execute(() => originalMethod.apply(this, args))
    }

    return descriptor
  }
}

// Export singleton instance
export const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance()

// Pre-configured circuit breakers for common services
export const s3CircuitBreaker = circuitBreakerRegistry.getBreaker('s3', {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000,      // 30 seconds
  monitoringPeriodMs: 10000,
  halfOpenAttempts: 2
})

export const redisCircuitBreaker = circuitBreakerRegistry.getBreaker('redis', {
  failureThreshold: 3,
  successThreshold: 2,
  timeoutMs: 20000,      // 20 seconds
  monitoringPeriodMs: 5000,
  halfOpenAttempts: 2
})

export const databaseCircuitBreaker = circuitBreakerRegistry.getBreaker('database', {
  failureThreshold: 3,
  successThreshold: 2,
  timeoutMs: 60000,      // 1 minute
  monitoringPeriodMs: 10000,
  halfOpenAttempts: 2
})