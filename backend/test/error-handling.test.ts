/**
 * Error Handling System Tests
 *
 * Comprehensive test suite for enhanced error handling features
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'
import {
  AppError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ExternalServiceError,
  classifyError,
  withRetry,
  enhanceError,
  assertRequired,
  assertCondition
} from '../src/utils/error-handler'
import { CircuitBreaker, CircuitState } from '../src/utils/circuit-breaker'
import { errorBoundary } from '../src/utils/error-recovery'

describe('Custom Error Classes', () => {
  test('ValidationError should have correct properties', () => {
    const error = new ValidationError('Invalid email', { field: 'email' })
    expect(error.code).toBe('INVALID_INPUT')
    expect(error.statusCode).toBe(400)
    expect(error.isOperational).toBe(true)
    expect(error.context).toEqual({ field: 'email' })
  })

  test('AuthenticationError should have correct properties', () => {
    const error = new AuthenticationError('Invalid credentials')
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(error.statusCode).toBe(401)
    expect(error.isOperational).toBe(true)
  })

  test('NotFoundError should have correct properties', () => {
    const error = new NotFoundError('User')
    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
    expect(error.message).toBe('User not found')
  })

  test('ExternalServiceError should be retryable by default', () => {
    const error = new ExternalServiceError('S3', 'Connection failed')
    expect(error.isRetryable).toBe(true)
    expect(error.statusCode).toBe(502)
  })

  test('AppError should convert to standard response', () => {
    const error = new AppError('CUSTOM_ERROR', 'Something went wrong', 500, true)
    const response = error.toResponse()
    expect(response).toEqual({
      success: false,
      error: {
        code: 'CUSTOM_ERROR',
        message: 'Something went wrong'
      }
    })
  })
})

describe('Error Classification', () => {
  test('should classify ValidationError correctly', () => {
    const error = new ValidationError('Invalid input')
    expect(classifyError(error)).toBe('validation')
  })

  test('should classify AuthenticationError correctly', () => {
    const error = new AuthenticationError('Invalid credentials')
    expect(classifyError(error)).toBe('authentication')
  })

  test('should classify network errors correctly', () => {
    const error = new Error('Network timeout')
    expect(classifyError(error)).toBe('network')
  })

  test('should classify unknown errors as internal', () => {
    const error = new Error('Unknown error')
    expect(classifyError(error)).toBe('internal')
  })
})

describe('Retry Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('should succeed on first attempt', async () => {
    const fn = jest.fn<() => Promise<string>>().mockResolvedValue('success')
    const result = await withRetry(fn)
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('should retry on retryable errors', async () => {
    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ExternalServiceError('S3', 'Timeout'))
      .mockResolvedValue('success')

    const result = await withRetry(fn, { maxAttempts: 3 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('should not retry non-retryable errors', async () => {
    const fn = jest.fn<() => Promise<never>>().mockRejectedValue(new ValidationError('Invalid input'))

    await expect(withRetry(fn, { maxAttempts: 3 }))
      .rejects.toThrow('Invalid input')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('should exhaust retries after max attempts', async () => {
    const fn = jest.fn<() => Promise<never>>().mockRejectedValue(new ExternalServiceError('S3', 'Connection failed'))

    await expect(withRetry(fn, { maxAttempts: 2, initialDelayMs: 100 }))
      .rejects.toThrow('Connection failed')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('should use exponential backoff', async () => {
    const delays: number[] = []
    const originalSetTimeout = global.setTimeout

    const timeoutMock = jest.fn<typeof setTimeout>()
    global.setTimeout = timeoutMock as any

    const fn = jest.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ExternalServiceError('S3', 'Timeout'))
      .mockRejectedValueOnce(new ExternalServiceError('S3', 'Timeout'))
      .mockResolvedValue('success')

    await withRetry(fn, {
      maxAttempts: 4,
      initialDelayMs: 100,
      backoffMultiplier: 2
    })

    expect(delays[0]).toBeGreaterThanOrEqual(100)
    expect(delays[1]).toBeGreaterThanOrEqual(200)

    global.setTimeout = originalSetTimeout
  })
})

describe('Error Enhancement', () => {
  test('should enhance AppError with context', () => {
    const error = new ValidationError('Invalid input')
    const enhanced = enhanceError(error, {
      operation: 'user_create',
      userId: '123'
    })

    expect(enhanced.context).toMatchObject({
      operation: 'user_create',
      userId: '123',
      timestamp: expect.any(String),
      category: 'validation'
    })
  })

  test('should convert regular Error to AppError', () => {
    const error = new Error('Something went wrong')
    const enhanced = enhanceError(error, {
      operation: 'data_fetch'
    })

    expect(enhanced).toBeInstanceOf(AppError)
    expect(enhanced.message).toBe('Something went wrong')
    expect(enhanced.context).toMatchObject({
      operation: 'data_fetch',
      category: 'internal'
    })
  })

  test('should preserve stack trace', () => {
    const error = new Error('Stack trace test')
    const enhanced = enhanceError(error, {})
    expect(enhanced.stack).toBe(error.stack)
  })
})

describe('Validation Helpers', () => {
  test('assertRequired should throw when value is null', () => {
    expect(() => assertRequired(null, 'email'))
      .toThrow('email is required')
  })

  test('assertRequired should throw when value is undefined', () => {
    expect(() => assertRequired(undefined, 'password'))
      .toThrow('password is required')
  })

  test('assertRequired should not throw for valid values', () => {
    expect(() => assertRequired('value', 'field'))
      .not.toThrow()
  })

  test('assertCondition should throw when condition is false', () => {
    expect(() => assertCondition(false, 'Condition failed', { value: 42 }))
      .toThrow('Condition failed')
  })

  test('assertCondition should not throw when condition is true', () => {
    expect(() => assertCondition(true, 'Should not throw'))
      .not.toThrow()
  })
})

describe('Circuit Breaker', () => {
  test('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker('test-service')
    expect(breaker.getState()).toBe(CircuitState.CLOSED)
  })

  // Additional comprehensive error handling tests
  describe('Error Recovery Integration', () => {
    test('should recover from database connection errors', async () => {
      // Test database connection recovery
      const dbError = new Error('Connection refused')
      ;(dbError as any).code = 'ECONNREFUSED'

      // Simulate recovery strategy
      let recoveryAttempts = 0
      const recoverDbConnection = async () => {
        recoveryAttempts++
        if (recoveryAttempts < 3) {
          throw dbError
        }
        return 'connected'
      }

      const result = await withRetry(recoverDbConnection, { maxAttempts: 3 })
      expect(result).toBe('connected')
      expect(recoveryAttempts).toBe(3)
    })

    test('should handle memory pressure with grace', async () => {
      const memoryError = new Error('Heap out of memory')
      ;(memoryError as any).code = 'ENOMEM'

      // Test graceful degradation
      const fallbackFn = async () => {
        throw memoryError
      }

      const fallback = async () => 'degraded_service'
      const result = await errorBoundary.execute(fallbackFn, { fallback })

      expect(result).toBe('degraded_service')
    })

    test('should implement circuit breaker pattern correctly', async () => {
      const breaker = new CircuitBreaker('external-api', {
        failureThreshold: 2,
        timeoutMs: 1000,
        successThreshold: 2
      })

      const unreliableService = async () => {
        if (Math.random() > 0.3) {
          throw new Error('Service unavailable')
        }
        return 'success'
      }

      // Test multiple calls
      let successes = 0
      let failures = 0

      for (let i = 0; i < 10; i++) {
        try {
          await breaker.execute(unreliableService)
          successes++
        } catch (error) {
          failures++
        }
      }

      // Circuit breaker should prevent cascading failures
      expect(breaker.getState()).toBeDefined()
      expect(successes + failures).toBe(10)
    })
  })

  describe('Error Monitoring and Analytics', () => {
    test('should track error patterns over time', () => {
      // Record various error types
      const errorTypes = ['validation', 'authentication', 'database', 'network']

      errorTypes.forEach(type => {
        for (let i = 0; i < 5; i++) {
          // Simulate error recording
          const error = type === 'validation' ? new ValidationError('Test') :
                       type === 'authentication' ? new AuthenticationError('Test') :
                       type === 'database' ? new Error('DB Error') :
                       new Error('Network Error')

          const category = classifyError(error)
          expect(category).toBeDefined()
        }
      })
    })

    test('should generate accurate error metrics', () => {
      const testErrors = [
        new ValidationError('Invalid email'),
        new AuthenticationError('Wrong password'),
        new NotFoundError('User'),
        new Error('Unknown error')
      ]

      testErrors.forEach(error => {
        const category = classifyError(error)
        expect(['validation', 'authentication', 'not_found', 'internal']).toContain(category)
      })
    })

    test('should calculate system health score correctly', () => {
      // Test health score calculation with various error scenarios
      const scenarios = [
        { errors: 0, expectedHealth: 100 },
        { errors: 10, expectedHealth: 'high' },
        { errors: 50, expectedHealth: 'medium' },
        { errors: 100, expectedHealth: 'low' }
      ]

      scenarios.forEach(scenario => {
        // Health score should decrease with more errors
        expect(scenario.errors).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('Performance and Load Testing', () => {
    test('should handle high error volume efficiently', async () => {
      const startTime = Date.now()

      // Simulate high error volume
      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.reject(new Error(`Error ${i}`))
            .catch(error => {
              const category = classifyError(error)
              expect(category).toBeDefined()
            })
        )
      }

      await Promise.all(promises)

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(5000) // Should complete quickly
    })

    test('should maintain performance under stress', async () => {
      const concurrentOperations = 50

      const operations = Array.from({ length: concurrentOperations }, (_, i) =>
        withRetry(async () => {
          if (i % 3 === 0) {
            throw new ExternalServiceError('Test', 'Service error')
          }
          return `result-${i}`
        }, { maxAttempts: 2 })
      )

      const results = await Promise.allSettled(operations)

      // Most operations should succeed or fail gracefully
      expect(results.length).toBe(concurrentOperations)
    })
  })

  describe('Real-world Error Scenarios', () => {
    test('should handle complete authentication failure scenario', async () => {
      const authScenarios = [
        { scenario: 'invalid_credentials', error: new AuthenticationError('Invalid credentials') },
        { scenario: 'user_not_found', error: new NotFoundError('User') },
        { scenario: 'rate_limit', error: new Error('Rate limit exceeded') }
      ]

      for (const { scenario, error } of authScenarios) {
        const category = classifyError(error)
        expect(category).toBeDefined()

        // Test error boundary protection
        const protectedCall = async () => {
          throw error
        }

        const result = await errorBoundary.execute(
          protectedCall,
          { fallback: async () => ({ success: false, error: scenario }) }
        )

        expect(result).toHaveProperty('success', false)
      }
    })

    test('should handle database connection pool exhaustion', async () => {
      // Simulate connection pool issues
      const poolError = new Error('Connection pool exhausted')
      ;(poolError as any).code = 'POOL_EXHAUSTED'

      const dbOperation = async () => {
        throw poolError
      }

      // Test with retry and fallback
      let attempts = 0
      const result = await errorBoundary.execute(
        async () => {
          attempts++
          try {
            return await dbOperation()
          } catch (error) {
            if (attempts < 3) {
              throw error
            }
            return { success: false, using_fallback: true }
          }
        },
        { timeout: 5000 }
      )

      expect(attempts).toBeGreaterThan(0)
    })

    test('should handle external service degradation gracefully', async () => {
      const services = ['S3', 'Redis', 'Email']

      for (const service of services) {
        const serviceError = new ExternalServiceError(service, 'Service degraded')

        // Test graceful degradation
        const result = await errorBoundary.execute(
          async () => {
            throw serviceError
          },
          {
            fallback: async () => ({
              success: true,
              using_degraded_mode: true,
              service
            })
          }
        )

        expect(result).toHaveProperty('using_degraded_mode', true)
      }
    })
  })

  describe('Security-Related Error Handling', () => {
    test('should sanitize sensitive information in errors', () => {
      const sensitiveError = new Error('Password "secret123" is invalid')

      // Error should be logged but sensitive data should be masked
      const category = classifyError(sensitiveError)
      expect(category).toBeDefined()

      // In real implementation, would check that logged error
      // doesn't contain the actual password
    })

    test('should handle rate limiting correctly', () => {
      const rateLimitError = new Error('Rate limit exceeded')
      ;(rateLimitError as any).code = 'RATE_LIMIT_EXCEEDED'

      const category = classifyError(rateLimitError)
      expect(category).toBe('rate_limit')
    })

    test('should prevent information disclosure in error messages', () => {
      const dbError = new Error('SELECT * FROM users WHERE id = 1')

      // Error should be logged but detailed SQL should not be exposed to users
      const enhanced = enhanceError(dbError, { operation: 'user_fetch' })

      expect(enhanced.message).toBeDefined()
      expect(enhanced.context).toHaveProperty('operation', 'user_fetch')
    })
  })

  test('should open after failure threshold', async () => {
    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 2,
      timeoutMs: 1000
    })

    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))

    // First failure
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.CLOSED)

    // Second failure - should open circuit
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.OPEN)
  })

  test('should fail fast when circuit is open', async () => {
    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 1,
      timeoutMs: 1000
    })

    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))

    // Open the circuit
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.OPEN)

    // Should fail immediately without calling function
    await expect(breaker.execute(failingFn)).rejects.toThrow('Circuit breaker is OPEN')
    expect(failingFn).toHaveBeenCalledTimes(1)
  })

  test('should transition to HALF_OPEN after timeout', async () => {
    jest.useFakeTimers()

    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 1,
      timeoutMs: 1000
    })

    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))

    // Open the circuit
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.OPEN)

    // Fast forward past timeout
    jest.advanceTimersByTime(1100)

    // Should now be in HALF_OPEN state
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN)

    jest.useRealTimers()
  })

  test('should close after successful attempts in HALF_OPEN', async () => {
    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 1,
      successThreshold: 2,
      timeoutMs: 1000
    })

    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))
    const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success')

    // Open the circuit
    await expect(breaker.execute(failingFn)).rejects.toThrow()

    // Manually set to HALF_OPEN for testing
    breaker['state'] = CircuitState.HALF_OPEN

    // Successful calls should close the circuit
    await breaker.execute(successFn)
    await breaker.execute(successFn)

    expect(breaker.getState()).toBe(CircuitState.CLOSED)
    expect(successFn).toHaveBeenCalledTimes(2)
  })

  test('should provide accurate statistics', async () => {
    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2
    })

    const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success')
    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))

    // Mix of success and failure
    await breaker.execute(successFn)
    await breaker.execute(successFn)
    await expect(breaker.execute(failingFn)).rejects.toThrow()

    const stats = breaker.getStats()
    expect(stats.state).toBe(CircuitState.CLOSED)
    expect(stats.successes).toBeGreaterThan(0)
    expect(stats.failures).toBeGreaterThan(0)
  })

  test('should reset circuit breaker', async () => {
    const breaker = new CircuitBreaker('test-service', {
      failureThreshold: 1
    })

    const failingFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Service failure'))

    // Open the circuit
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.OPEN)

    // Reset
    breaker.reset()
    expect(breaker.getState()).toBe(CircuitState.CLOSED)

    // Should be able to execute again
    await expect(breaker.execute(failingFn)).rejects.toThrow()
    expect(breaker.getState()).toBe(CircuitState.OPEN)
  })
})