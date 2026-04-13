/**
 * Enhanced Error Monitoring System
 * Provides real-time error tracking, pattern detection, and automated response
 */

import { logger, logEvents } from './logger'
import { classifyError, type ErrorCategory } from './error-handler'
import { CircuitBreakerRegistry } from './circuit-breaker'

// ─── Error Analytics & Pattern Detection ────────────────────────────────

interface ErrorEvent {
  timestamp: string
  category: ErrorCategory
  code: string
  message: string
  userId?: string
  endpoint?: string
  userAgent?: string
  ip?: string
  correlationId?: string
  stack?: string
  recovered: boolean
  recoveryTime?: number
}

interface ErrorPattern {
  category: ErrorCategory
  frequency: number
  lastOccurrence: string
  trend: 'increasing' | 'stable' | 'decreasing'
  severity: 'low' | 'medium' | 'high' | 'critical'
  affectedUsers: number
  suggestedAction: string
}

interface ErrorMetrics {
  totalErrors: number
  errorsByCategory: Record<ErrorCategory, number>
  errorsByHour: Record<string, number>
  averageRecoveryTime: number
  criticalErrorRate: number
  userImpactScore: number
}

export class ErrorMonitor {
  private static instance: ErrorMonitor
  private errorEvents: ErrorEvent[] = []
  private maxEventsInMemory: number = 1000
  private alertThresholds = {
    criticalErrorsPerMinute: 10,
    errorRateIncreaseFactor: 2.0,
    userImpactThreshold: 100, // users affected
    systemHealthThreshold: 0.95 // 95% success rate
  }

  private constructor() {
    this.startPeriodicAnalysis()
  }

  static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor()
    }
    return ErrorMonitor.instance
  }

  /**
   * Record an error event for analysis
   */
  recordError(error: ErrorEvent): void {
    error.timestamp = new Date().toISOString()

    // Add to in-memory store
    this.errorEvents.push(error)

    // Keep only recent events in memory
    if (this.errorEvents.length > this.maxEventsInMemory) {
      this.errorEvents = this.errorEvents.slice(-this.maxEventsInMemory)
    }

    // Check for immediate alerting conditions
    this.checkAlertConditions(error)

    // Log the error with enhanced context
    logger.error({
      event: 'error_recorded',
      category: error.category,
      code: error.code,
      endpoint: error.endpoint,
      userId: error.userId ? this.hashUserId(error.userId) : undefined,
      correlationId: error.correlationId,
      severity: this.calculateSeverity(error)
    })
  }

  /**
   * Get comprehensive error metrics
   */
  getMetrics(): ErrorMetrics {
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000

    const recentErrors = this.errorEvents.filter(e =>
      new Date(e.timestamp).getTime() > oneHourAgo
    )

    const errorsByCategory: Record<ErrorCategory, number> = {} as any
    const errorsByHour: Record<string, number> = {}
    let totalRecoveryTime = 0
    let recoveredCount = 0
    const affectedUsers = new Set<string>()

    recentErrors.forEach(error => {
      // Count by category
      errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1

      // Count by hour
      const hour = new Date(error.timestamp).toISOString().slice(0, 13) + ':00'
      errorsByHour[hour] = (errorsByHour[hour] || 0) + 1

      // Calculate recovery time
      if (error.recovered && error.recoveryTime) {
        totalRecoveryTime += error.recoveryTime
        recoveredCount++
      }

      // Track affected users
      if (error.userId) {
        affectedUsers.add(error.userId)
      }
    })

    return {
      totalErrors: recentErrors.length,
      errorsByCategory,
      errorsByHour,
      averageRecoveryTime: recoveredCount > 0 ? totalRecoveryTime / recoveredCount : 0,
      criticalErrorRate: this.calculateCriticalErrorRate(recentErrors),
      userImpactScore: affectedUsers.size
    }
  }

  /**
   * Detect error patterns and suggest actions
   */
  detectPatterns(): ErrorPattern[] {
    const patterns: ErrorPattern[] = []
    const metrics = this.getMetrics()

    // Analyze each category
    Object.entries(metrics.errorsByCategory).forEach(([category, frequency]) => {
      const categoryEvents = this.errorEvents.filter(e => e.category === category)
      const lastOccurrence = categoryEvents[categoryEvents.length - 1]?.timestamp || new Date().toISOString()

      // Determine trend
      const trend = this.calculateTrend(category as ErrorCategory)

      // Calculate severity
      const severity = this.calculatePatternSeverity(category as ErrorCategory, frequency, trend)

      // Count affected users
      const affectedUsers = new Set(categoryEvents.map(e => e.userId).filter(Boolean)).size

      // Suggest action based on pattern
      const suggestedAction = this.suggestAction(category as ErrorCategory, severity, trend, frequency)

      patterns.push({
        category: category as ErrorCategory,
        frequency,
        lastOccurrence,
        trend,
        severity,
        affectedUsers,
        suggestedAction
      })
    })

    return patterns.sort((a, b) => b.frequency - a.frequency)
  }

  /**
   * Get system health score (0-100)
   */
  getSystemHealth(): {
    score: number
    status: 'healthy' | 'degraded' | 'unhealthy'
    issues: string[]
  } {
    const metrics = this.getMetrics()
    const patterns = this.detectPatterns()

    const issues: string[] = []
    let score = 100

    // Penalize based on error frequency
    if (metrics.totalErrors > 100) {
      score -= 20
      issues.push('High error frequency detected')
    } else if (metrics.totalErrors > 50) {
      score -= 10
      issues.push('Elevated error frequency')
    }

    // Penalize critical errors heavily
    score -= metrics.criticalErrorRate * 30

    // Penalize user impact
    if (metrics.userImpactScore > 50) {
      score -= 15
      issues.push('High user impact')
    } else if (metrics.userImpactScore > 20) {
      score -= 5
      issues.push('Moderate user impact')
    }

    // Check for increasing trends
    const increasingPatterns = patterns.filter(p => p.trend === 'increasing' && p.severity !== 'low')
    if (increasingPatterns.length > 2) {
      score -= 10
      issues.push('Multiple error types showing increasing trend')
    }

    // Check circuit breaker status
    const circuitBreakerStatus = CircuitBreakerRegistry.getInstance().getAllStatuses()
    const openCircuits = circuitBreakerStatus.filter(cb => cb.state === 'OPEN')
    if (openCircuits.length > 0) {
      score -= openCircuits.length * 15
      issues.push(`${openCircuits.length} circuit(s) open: ${openCircuits.map(c => c.service).join(', ')}`)
    }

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score))

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy'
    if (score >= 90) {
      status = 'healthy'
    } else if (score >= 70) {
      status = 'degraded'
    } else {
      status = 'unhealthy'
    }

    return { score, status, issues }
  }

  /**
   * Generate correlation ID for request tracking
   */
  generateCorrelationId(): string {
    return `correlation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ─── Private Methods ───────────────────────────────────────────────

  private checkAlertConditions(error: ErrorEvent): void {
    // Check for critical error spike
    if (error.category === 'internal' || error.category === 'database') {
      const recentCriticalErrors = this.errorEvents.filter(e => {
        const timeDiff = Date.now() - new Date(e.timestamp).getTime()
        return timeDiff < 60000 && (e.category === 'internal' || e.category === 'database')
      })

      if (recentCriticalErrors.length >= this.alertThresholds.criticalErrorsPerMinute) {
        this.triggerAlert('CRITICAL_ERROR_SPIKE', {
          count: recentCriticalErrors.length,
          timeframe: '1 minute',
          latestError: error.message
        })
      }
    }

    // Check for user-impacting errors
    if (error.category === 'authentication' || error.category === 'authorization') {
      const recentAuthErrors = this.errorEvents.filter(e => {
        const timeDiff = Date.now() - new Date(e.timestamp).getTime()
        return timeDiff < 300000 && (e.category === 'authentication' || e.category === 'authorization')
      })

      if (recentAuthErrors.length > 50) {
        this.triggerAlert('AUTHENTICATION_ISSUES', {
          count: recentAuthErrors.length,
          timeframe: '5 minutes'
        })
      }
    }
  }

  private triggerAlert(type: string, data: any): void {
    logger.error({
      event: 'error_monitor_alert',
      alertType: type,
      ...data,
      timestamp: new Date().toISOString()
    })

    // In production, this would integrate with alerting services
    // like PagerDuty, Slack, email, etc.
  }

  private calculateTrend(category: ErrorCategory): 'increasing' | 'stable' | 'decreasing' {
    const categoryEvents = this.errorEvents.filter(e => e.category === category)
    if (categoryEvents.length < 10) return 'stable'

    const now = Date.now()
    const recentWindow = 15 * 60 * 1000 // 15 minutes
    const olderWindow = 30 * 60 * 1000 // 30 minutes

    const recentCount = categoryEvents.filter(e =>
      now - new Date(e.timestamp).getTime() < recentWindow
    ).length

    const olderCount = categoryEvents.filter(e => {
      const age = now - new Date(e.timestamp).getTime()
      return age >= recentWindow && age < recentWindow + olderWindow
    }).length

    const rateIncrease = olderCount > 0 ? recentCount / olderCount : 1

    if (rateIncrease >= this.alertThresholds.errorRateIncreaseFactor) {
      return 'increasing'
    } else if (rateIncrease <= 0.5) {
      return 'decreasing'
    }
    return 'stable'
  }

  private calculateSeverity(error: ErrorEvent): 'low' | 'medium' | 'high' | 'critical' {
    if (error.category === 'internal' || error.category === 'database') {
      return 'critical'
    }
    if (error.category === 'authentication' || error.category === 'authorization') {
      return 'high'
    }
    if (error.category === 'external_service' || error.category === 'network') {
      return 'medium'
    }
    return 'low'
  }

  private calculatePatternSeverity(
    category: ErrorCategory,
    frequency: number,
    trend: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (category === 'internal' || category === 'database') {
      return 'critical'
    }
    if (category === 'authentication' || category === 'authorization') {
      return frequency > 50 ? 'critical' : 'high'
    }
    if (trend === 'increasing' && frequency > 20) {
      return 'high'
    }
    if (frequency > 100) {
      return 'high'
    }
    if (frequency > 20) {
      return 'medium'
    }
    return 'low'
  }

  private calculateCriticalErrorRate(errors: ErrorEvent[]): number {
    if (errors.length === 0) return 0

    const criticalErrors = errors.filter(e =>
      e.category === 'internal' || e.category === 'database'
    )

    return criticalErrors.length / errors.length
  }

  private suggestAction(
    category: ErrorCategory,
    severity: string,
    trend: string,
    frequency: number
  ): string {
    const suggestions: Record<ErrorCategory, string> = {
      validation: 'Review input validation rules and API documentation',
      authentication: 'Check authentication service status and rate limits',
      authorization: 'Verify permission checks and role assignments',
      not_found: 'Review API routes and resource availability',
      rate_limit: 'Adjust rate limit thresholds or investigate abuse',
      external_service: 'Check third-party service status and consider fallback',
      database: 'Investigate database performance and connection pooling',
      storage: 'Verify storage service connectivity and credentials',
      internal: 'Review application logs and system resources',
      network: 'Check network connectivity and firewall rules'
    }

    let suggestion = suggestions[category] || 'Monitor and investigate'

    if (severity === 'critical') {
      suggestion = `URGENT: ${suggestion}. Immediate investigation required.`
    } else if (trend === 'increasing') {
      suggestion = `${suggestion} (Trend increasing - monitor closely)`
    } else if (frequency > 100) {
      suggestion = `${suggestion} (High frequency - consider scaling or optimization)`
    }

    return suggestion
  }

  private hashUserId(userId: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 8)
  }

  private startPeriodicAnalysis(): void {
    // Run analysis every 5 minutes
    setInterval(() => {
      this.runPeriodicAnalysis()
    }, 5 * 60 * 1000)
  }

  private runPeriodicAnalysis(): void {
    const health = this.getSystemHealth()
    const patterns = this.detectPatterns()

    logger.info({
      event: 'error_monitor_analysis',
      health,
      patterns: patterns.slice(0, 5), // Log top 5 patterns
      timestamp: new Date().toISOString()
    })

    // Trigger alerts based on health status
    if (health.status === 'unhealthy') {
      this.triggerAlert('SYSTEM_UNHEALTHY', {
        score: health.score,
        issues: health.issues
      })
    }
  }
}

// Export singleton instance
export const errorMonitor = ErrorMonitor.getInstance()