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