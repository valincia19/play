/**
 * API Monitoring System
 * Tracks API performance, error rates, and provides health metrics
 */

import { logger } from './logger'

interface ApiCallMetrics {
  endpoint: string
  method: string
  statusCode: number
  responseTimeMs: number
  timestamp: number
  success: boolean
  error?: string
  userId?: string
  correlationId?: string
}

interface EndpointStats {
  endpoint: string
  method: string
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  avgResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  errorRate: number
  lastError?: string
 lastErrorTime?: number
}

interface HealthCheck {
  service: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastCheck: number
  responseTimeMs?: number
  error?: string
}

export class ApiMonitor {
  private metrics: ApiCallMetrics[] = []
  private maxMetricsSize = 10000 // Keep last 10k metrics
  private endpointStats: Map<string, EndpointStats> = new Map()
  private healthChecks: Map<string, HealthCheck> = new Map()

  /**
   * Record an API call
   */
  recordCall(metric: ApiCallMetrics): void {
    // Add to metrics
    this.metrics.push(metric)

    // Trim if needed
    if (this.metrics.length > this.maxMetricsSize) {
      this.metrics = this.metrics.slice(-this.maxMetricsSize)
    }

    // Update endpoint stats
    this.updateEndpointStats(metric)

    // Log slow requests
    if (metric.responseTimeMs > 1000) {
      logger.warn({
        event: 'slow_api_call',
        endpoint: metric.endpoint,
        method: metric.method,
        responseTimeMs: metric.responseTimeMs,
        statusCode: metric.statusCode
      })
    }

    // Log errors
    if (!metric.success) {
      logger.warn({
        event: 'api_call_failed',
        endpoint: metric.endpoint,
        method: metric.method,
        statusCode: metric.statusCode,
        error: metric.error
      })
    }
  }

  /**
   * Get stats for a specific endpoint
   */
  getEndpointStats(endpoint: string, method: string): EndpointStats | null {
    const key = `${method}:${endpoint}`
    return this.endpointStats.get(key) || null
  }

  /**
   * Get all endpoint stats
   */
  getAllEndpointStats(): EndpointStats[] {
    return Array.from(this.endpointStats.values())
  }

  /**
   * Get health status of all monitored services
   */
  getHealthStatus(): HealthCheck[] {
    return Array.from(this.healthChecks.values())
  }

  /**
   * Update health check for a service
   */
  updateHealthCheck(healthCheck: HealthCheck): void {
    this.healthChecks.set(healthCheck.service, healthCheck)

    // Log health status changes
    if (healthCheck.status === 'unhealthy') {
      logger.error({
        event: 'service_unhealthy',
        service: healthCheck.service,
        error: healthCheck.error
      })
    } else if (healthCheck.status === 'degraded') {
      logger.warn({
        event: 'service_degraded',
        service: healthCheck.service,
        responseTimeMs: healthCheck.responseTimeMs
      })
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(timeRangeMs: number = 3600000): any {
    const now = Date.now()
    const startTime = now - timeRangeMs

    const recentMetrics = this.metrics.filter(m => m.timestamp >= startTime)

    const totalCalls = recentMetrics.length
    const successfulCalls = recentMetrics.filter(m => m.success).length
    const failedCalls = totalCalls - successfulCalls

    const responseTimes = recentMetrics.map(m => m.responseTimeMs)
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0

    const errorRate = totalCalls > 0 ? (failedCalls / totalCalls) * 100 : 0

    // Get error breakdown
    const errorBreakdown = recentMetrics
      .filter(m => !m.success)
      .reduce((acc, m) => {
        const error = m.error || 'unknown'
        acc[error] = (acc[error] || 0) + 1
        return acc
      }, {} as Record<string, number>)

    return {
      timeRange: `${timeRangeMs}ms`,
      totalCalls,
      successfulCalls,
      failedCalls,
      errorRate: `${errorRate.toFixed(2)}%`,
      avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      errorBreakdown,
      endpointStats: this.getAllEndpointStats()
    }
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    const endpoints = this.getAllEndpointStats()
    const slowEndpoints = endpoints
      .filter(e => e.avgResponseTime > 500)
      .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
      .slice(0, 10)

    const errorProneEndpoints = endpoints
      .filter(e => e.errorRate > 5)
      .sort((a, b) => b.errorRate - a.errorRate)
      .slice(0, 10)

    return {
      slowEndpoints: slowEndpoints.map(e => ({
        endpoint: e.endpoint,
        method: e.method,
        avgResponseTime: `${e.avgResponseTime.toFixed(2)}ms`,
        maxResponseTime: `${e.maxResponseTime}ms`,
        totalCalls: e.totalCalls
      })),
      errorProneEndpoints: errorProneEndpoints.map(e => ({
        endpoint: e.endpoint,
        method: e.method,
        errorRate: `${e.errorRate.toFixed(2)}%`,
        failedCalls: e.failedCalls,
        lastError: e.lastError
      }))
    }
  }

  private updateEndpointStats(metric: ApiCallMetrics): void {
    const key = `${metric.method}:${metric.endpoint}`

    let stats = this.endpointStats.get(key)
    if (!stats) {
      stats = {
        endpoint: metric.endpoint,
        method: metric.method,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        errorRate: 0
      }
      this.endpointStats.set(key, stats)
    }

    // Update stats
    stats.totalCalls++
    stats.minResponseTime = Math.min(stats.minResponseTime, metric.responseTimeMs)
    stats.maxResponseTime = Math.max(stats.maxResponseTime, metric.responseTimeMs)

    if (metric.success) {
      stats.successfulCalls++
    } else {
      stats.failedCalls++
      stats.lastError = metric.error
      stats.lastErrorTime = metric.timestamp
    }

    // Calculate average response time
    const totalResponseTime = stats.avgResponseTime * (stats.totalCalls - 1) + metric.responseTimeMs
    stats.avgResponseTime = totalResponseTime / stats.totalCalls

    // Calculate error rate
    stats.errorRate = (stats.failedCalls / stats.totalCalls) * 100
  }

  /**
   * Clear old metrics
   */
  clearOldMetrics(olderThanMs: number = 86400000): void {
    const cutoff = Date.now() - olderThanMs
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff)
  }
}

// Singleton instance
export const apiMonitor = new ApiMonitor()

/**
 * Middleware factory for API monitoring
 */
export function createApiMonitoringMiddleware() {
  return async (context: any) => {
    const startTime = Date.now()
    const request = context.request
    const response = context.set

    // Extract correlation ID if available
    const correlationId = request.headers.get('x-correlation-id') || undefined

    // Extract user ID if available (from auth context)
    const userId = context.userId || undefined

    try {
      // Let request proceed
      const result = await context.next()

      const responseTimeMs = Date.now() - startTime
      const statusCode = response.status || 200

      // Record successful call
      apiMonitor.recordCall({
        endpoint: new URL(request.url).pathname,
        method: request.method,
        statusCode,
        responseTimeMs,
        timestamp: Date.now(),
        success: statusCode >= 200 && statusCode < 400,
        userId,
        correlationId
      })

      return result
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime
      const statusCode = error.statusCode || 500

      // Record failed call
      apiMonitor.recordCall({
        endpoint: new URL(request.url).pathname,
        method: request.method,
        statusCode,
        responseTimeMs,
        timestamp: Date.now(),
        success: false,
        error: error.message || 'Unknown error',
        userId,
        correlationId
      })

      throw error
    }
  }
}

/**
 * Health check helper
 */
export async function performHealthCheck(
  service: string,
  checkFn: () => Promise<void>
): Promise<HealthCheck> {
  const startTime = Date.now()

  try {
    await checkFn()
    const responseTimeMs = Date.now() - startTime

    const healthCheck: HealthCheck = {
      service,
      status: responseTimeMs > 1000 ? 'degraded' : 'healthy',
      lastCheck: Date.now(),
      responseTimeMs
    }

    apiMonitor.updateHealthCheck(healthCheck)
    return healthCheck
  } catch (error: any) {
    const healthCheck: HealthCheck = {
      service,
      status: 'unhealthy',
      lastCheck: Date.now(),
      error: error.message || 'Health check failed'
    }

    apiMonitor.updateHealthCheck(healthCheck)
    return healthCheck
  }
}