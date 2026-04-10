# Error Handling Implementation Guide

This guide provides practical examples and best practices for using the enhanced error handling system in the Vercelplay application.

## Table of Contents
1. [Backend Error Handling](#backend-error-handling)
2. [Frontend Error Handling](#frontend-error-handling)
3. [Circuit Breaker Usage](#circuit-breaker-usage)
4. [API Monitoring](#api-monitoring)
5. [Testing](#testing)

---

## Backend Error Handling

### Custom Error Classes

Use custom error classes for better error categorization and handling:

```typescript
import {
  ValidationError,
  AuthenticationError,
  NotFoundError,
  ExternalServiceError,
  StorageError
} from './utils/error-handler'

// In your services
async updateUser(userId: string, data: { name?: string }) {
  // Validation
  if (!data.name || data.name.length < 2) {
    throw new ValidationError('Name must be at least 2 characters', {
      field: 'name',
      minLength: 2
    })
  }

  // Not found
  const user = await db.findUser(userId)
  if (!user) {
    throw new NotFoundError('User')
  }

  // External service errors
  try {
    await s3Service.uploadAvatar(userId, data.avatar)
  } catch (error) {
    throw new ExternalServiceError('S3', 'Failed to upload avatar', true, {
      userId,
      fileSize: data.avatar.size
    })
  }
}
```

### Retry Logic

Use the `withRetry` function for operations that might fail temporarily:

```typescript
import { withRetry } from './utils/error-handler'

async uploadToS3WithRetry(file: File) {
  return withRetry(
    async () => {
      return await s3Client.upload(file)
    },
    {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2
    },
    's3_upload'
  )
}

// In service methods
async sendEmailWithRetry(email: string, subject: string, body: string) {
  return withRetry(
    async () => {
      return await emailService.send({ to: email, subject, body })
    },
    {
      maxAttempts: 5,
      initialDelayMs: 2000
    },
    'email_send'
  )
}
```

### Validation Helpers

Use assertion helpers for input validation:

```typescript
import { assertRequired, assertCondition } from './utils/error-handler'

async createVideo(input: CreateVideoInput) {
  // Assert required fields
  assertRequired(input.title, 'title')
  assertRequired(input.file, 'file')

  // Assert business conditions
  assertCondition(
    input.file.size <= MAX_FILE_SIZE,
    `File size exceeds ${MAX_FILE_SIZE} bytes`,
    { maxSize: MAX_FILE_SIZE, actualSize: input.file.size }
  )

  // Continue with valid input
  return await db.createVideo(input)
}
```

### Safe Async Operations

Use `safeAsync` for operations where you want to handle errors gracefully:

```typescript
import { safeAsync } from './utils/error-handler'

async getVideoWithFallback(videoId: string) {
  const [video, error] = await safeAsync(
    () => db.findVideo(videoId),
    'video_fetch'
  )

  if (error) {
    logger.error({ event: 'video_fetch_failed', videoId, error })
    return null // Return fallback value
  }

  return video
}
```

---

## Frontend Error Handling

### Error Boundaries

Use error boundaries to catch component errors:

```tsx
import { ErrorBoundary } from '@/components/error-boundary'

// Wrap your entire app
<ErrorBoundary
  onError={(error, errorInfo) => {
    console.error('App error:', error, errorInfo)
    // Send to error tracking service
  }}
>
  <App />
</ErrorBoundary>

// Wrap specific features
<ErrorBoundary
  fallback={<VideoPlayerError />}
  onError={(error) => {
    trackError('video_player', error)
  }}
>
  <VideoPlayer />
</ErrorBoundary>
```

### Async Error Boundaries

Handle async operation errors with retry logic:

```tsx
import { AsyncErrorBoundary, useAsync } from '@/components/async-error-boundary'

function VideoUpload() {
  const [file, setFile] = useState<File | null>(null)

  return (
    <AsyncErrorBoundary
      onRetry={async () => {
        if (file) {
          await uploadVideo(file)
        }
      }}
      maxRetries={3}
    >
      {({ retry, isLoading, error }) => (
        <div>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <button onClick={retry} disabled={isLoading || !file}>
            {isLoading ? 'Uploading...' : 'Upload'}
          </button>
          {error && <p className="text-red-500">{error.message}</p>}
        </div>
      )}
    </AsyncErrorBoundary>
  )
}
```

### Use Async Hook

Handle async operations with built-in retry logic:

```tsx
import { useAsync } from '@/components/async-error-boundary'

function UserProfile({ userId }: { userId: string }) {
  const { data: user, isLoading, error, execute } = useAsync(
    () => api.getUser(userId),
    {
      onSuccess: (data) => {
        console.log('User loaded:', data)
      },
      onError: (error) => {
        toast.error('Failed to load user profile')
      },
      maxRetries: 3
    }
  )

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={execute}>Refresh</button>
    </div>
  )
}
```

---

## Circuit Breaker Usage

### Basic Circuit Breaker

Protect external service calls with circuit breakers:

```typescript
import { circuitBreakerRegistry } from './utils/circuit-breaker'

async callExternalApi() {
  const breaker = circuitBreakerRegistry.getBreaker('external_api', {
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 30000
  })

  return breaker.execute(async () => {
    return await fetch('https://api.example.com/data')
  })
}
```

### Pre-configured Circuit Breakers

Use pre-configured circuit breakers for common services:

```typescript
import { s3CircuitBreaker, redisCircuitBreaker, databaseCircuitBreaker } from './utils/circuit-breaker'

// S3 operations
async uploadFile(key: string, data: Buffer) {
  return s3CircuitBreaker.execute(async () => {
    return await s3Client.putObject({
      Bucket: bucket,
      Key: key,
      Body: data
    })
  })
}

// Redis operations
async cacheUser(userId: string, data: any) {
  return redisCircuitBreaker.execute(async () => {
    return await redis.setex(`user:${userId}`, 3600, JSON.stringify(data))
  })
}
```

### Circuit Breaker Monitoring

Monitor circuit breaker status:

```typescript
import { circuitBreakerRegistry } from './utils/circuit-breaker'

// Get all circuit breaker statuses
app.get('/admin/circuit-breakers', (req, res) => {
  const statuses = circuitBreakerRegistry.getAllStatuses()
  res.json(statuses)
})

// Reset specific circuit breaker
app.post('/admin/circuit-breakers/:service/reset', (req, res) => {
  const { service } = req.params
  circuitBreakerRegistry.reset(service)
  res.json({ message: `Circuit breaker for ${service} reset` })
})
```

---

## API Monitoring

### Automatic Monitoring

Enable API monitoring in your app:

```typescript
import { createApiMonitoringMiddleware } from './utils/api-monitor'

// Add monitoring middleware to your Elysia app
const app = new Elysia()
  .onError(handleErrors)
  .use(createApiMonitoringMiddleware())
  // ... rest of your routes
```

### Health Checks

Implement health checks for your services:

```typescript
import { performHealthCheck } from './utils/api-monitor'

// Health check endpoint
app.get('/health', async () => {
  const healthChecks = await Promise.all([
    performHealthCheck('database', async () => {
      await db.query('SELECT 1')
    }),
    performHealthCheck('redis', async () => {
      await redis.ping()
    }),
    performHealthCheck('s3', async () => {
      await s3Client.headBucket({ Bucket })
    })
  ])

  const allHealthy = healthChecks.every(h => h.status === 'healthy')

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    checks: healthChecks,
    timestamp: new Date().toISOString()
  }
})
```

### Performance Monitoring

Access performance metrics:

```typescript
import { apiMonitor } from './utils/api-monitor'

// Performance monitoring endpoint
app.get('/admin/metrics', (req, res) => {
  const metrics = apiMonitor.getMetricsSummary(3600000) // Last hour
  const performance = apiMonitor.getPerformanceMetrics()

  res.json({
    metrics,
    performance
  })
})
```

---

## Testing

### Testing Error Handling

Write tests for error scenarios:

```typescript
import {
  ValidationError,
  withRetry,
  CircuitBreaker
} from '../utils/error-handler'

describe('Service Error Handling', () => {
  test('should throw ValidationError for invalid input', async () => {
    const service = new UserService()

    await expect(
      service.createUser({ name: '', email: 'invalid' })
    ).rejects.toThrow(ValidationError)
  })

  test('should retry failed operations', async () => {
    let attempts = 0
    const flakyFn = jest.fn().mockImplementation(async () => {
      attempts++
      if (attempts < 3) {
        throw new ExternalServiceError('S3', 'Timeout')
      }
      return 'success'
    })

    const result = await withRetry(flakyFn, { maxAttempts: 3 })
    expect(result).toBe('success')
    expect(attempts).toBe(3)
  })

  test('should open circuit breaker after failures', async () => {
    const breaker = new CircuitBreaker('test', {
      failureThreshold: 2,
      timeoutMs: 1000
    })

    const failingFn = jest.fn().mockRejectedValue(new Error('Service down'))

    await expect(breaker.execute(failingFn)).rejects.toThrow()
    await expect(breaker.execute(failingFn)).rejects.toThrow()

    expect(breaker.getState()).toBe('OPEN')

    // Should fail fast
    await expect(breaker.execute(failingFn)).rejects.toThrow('Circuit breaker is OPEN')
    expect(failingFn).toHaveBeenCalledTimes(2)
  })
})
```

---

## Best Practices

### 1. Error Categories
- Use specific error classes for different error types
- Include relevant context in error objects
- Make errors operational vs. programming errors

### 2. Retry Strategies
- Only retry idempotent operations
- Use exponential backoff with jitter
- Set reasonable retry limits
- Log retry attempts for monitoring

### 3. Circuit Breakers
- Configure thresholds based on service reliability
- Monitor circuit breaker states
- Provide fallback functionality
- Implement manual reset capabilities

### 4. Monitoring
- Track error rates by endpoint
- Monitor response times
- Set up alerts for degraded performance
- Regular review of error patterns

### 5. User Experience
- Provide clear, actionable error messages
- Implement retry mechanisms in UI
- Show loading states during retries
- Log errors while maintaining privacy

---

## Migration Guide

### Migrating Existing Code

**Before:**
```typescript
throw error(errorCodes.INVALID_INPUT, 'Name is required')
```

**After:**
```typescript
throw new ValidationError('Name is required', { field: 'name' })
```

**Before:**
```typescript
try {
  await s3.upload(file)
} catch (err) {
  logger.error('Upload failed', err)
  throw error(errorCodes.STORAGE_UPLOAD_FAILED, 'Upload failed')
}
```

**After:**
```typescript
try {
  await s3CircuitBreaker.execute(async () => {
    return await s3.upload(file)
  })
} catch (err) {
  if (err instanceof ExternalServiceError) {
    logger.error('S3 upload failed', { error: err.message, context: err.context })
    throw new StorageError('Failed to upload video', err.isRetryable, { fileSize: file.size })
  }
  throw err
}
```

---

## Conclusion

This enhanced error handling system provides:

1. **Better Error Classification** - Custom error classes for different scenarios
2. **Resilience** - Retry logic and circuit breakers for transient failures
3. **Monitoring** - Comprehensive error tracking and performance metrics
4. **User Experience** - Graceful error handling with recovery options
5. **Testing Support** - Well-tested components with clear interfaces

Implement these patterns gradually across your codebase, starting with critical paths and external service integrations.