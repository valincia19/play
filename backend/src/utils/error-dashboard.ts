/**
 * Error Analytics Dashboard & Reporting
 * Provides comprehensive error visibility and reporting capabilities
 */

import { errorMonitor } from './error-monitor'
import { CircuitBreakerRegistry } from './circuit-breaker'
import { recoveryManager } from './error-recovery'
import { logger } from './logger'

// ─── Dashboard Data Structures ───────────────────────────────────────────

interface DashboardData {
  summary: {
    totalErrors: number
    criticalErrors: number
    systemHealthScore: number
    status: 'healthy' | 'degraded' | 'unhealthy'
    lastUpdated: string
  }
  errorMetrics: {
    byCategory: Record<string, number>
    byEndpoint: Record<string, number>
    byHour: Record<string, number>
    topErrors: Array<{ message: string; count: number; category: string }>
  }
  systemMetrics: {
    circuitBreakers: any[]
    recoveryAttempts: number
    activeRecoveries: number
    performanceMetrics: {
      averageResponseTime: number
      errorRate: number
      throughput: number
    }
  }
  userImpact: {
    affectedUsers: number
    topAffectedUsers: Array<{ userId: string; errorCount: number }>
    errorByUserSegment: Record<string, number>
  }
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low'
    category: string
    action: string
    estimatedImpact: string
  }>
}

export class ErrorDashboard {
  private static instance: ErrorDashboard

  private constructor() {}

  static getInstance(): ErrorDashboard {
    if (!ErrorDashboard.instance) {
      ErrorDashboard.instance = new ErrorDashboard()
    }
    return ErrorDashboard.instance
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const health = errorMonitor.getSystemHealth()
    const metrics = errorMonitor.getMetrics()
    const patterns = errorMonitor.detectPatterns()
    const circuitBreakerStatus = CircuitBreakerRegistry.getInstance().getAllStatuses()
    const recoveryStats = recoveryManager.getRecoveryStats()

    return {
      summary: {
        totalErrors: metrics.totalErrors,
        criticalErrors: Math.round(metrics.totalErrors * metrics.criticalErrorRate),
        systemHealthScore: health.score,
        status: health.status,
        lastUpdated: new Date().toISOString()
      },
      errorMetrics: {
        byCategory: metrics.errorsByCategory,
        byEndpoint: this.getErrorsByEndpoint(),
        byHour: metrics.errorsByHour,
        topErrors: this.getTopErrors()
      },
      systemMetrics: {
        circuitBreakers: circuitBreakerStatus,
        recoveryAttempts: recoveryStats.activeRecoveries,
        activeRecoveries: recoveryStats.activeRecoveries,
        performanceMetrics: await this.getPerformanceMetrics()
      },
      userImpact: {
        affectedUsers: metrics.userImpactScore,
        topAffectedUsers: this.getTopAffectedUsers(),
        errorByUserSegment: this.getErrorsByUserSegment()
      },
      recommendations: this.generateRecommendations(health, patterns, circuitBreakerStatus)
    }
  }

  /**
   * Generate error report for specific time period
   */
  async generateReport(startDate: Date, endDate: Date): Promise<{
    period: { start: string; end: string }
    summary: any
    trends: any[]
    criticalIncidents: any[]
    recommendations: string[]
  }> {
    const health = errorMonitor.getSystemHealth()
    const patterns = errorMonitor.detectPatterns()

    return {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      },
      summary: {
        totalErrors: patterns.reduce((sum, p) => sum + p.frequency, 0),
        criticalPatterns: patterns.filter(p => p.severity === 'critical').length,
        systemHealth: health.score
      },
      trends: patterns.map(p => ({
        category: p.category,
        frequency: p.frequency,
        trend: p.trend,
        severity: p.severity
      })),
      criticalIncidents: patterns
        .filter(p => p.severity === 'critical')
        .map(p => ({
          category: p.category,
          frequency: p.frequency,
          affectedUsers: p.affectedUsers,
          suggestedAction: p.suggestedAction
        })),
      recommendations: patterns.map(p => p.suggestedAction)
    }
  }

  /**
   * Get real-time error stream for monitoring
   */
  getErrorStream(options?: {
    limit?: number
    categories?: string[]
    minSeverity?: string
  }): any[] {
    // This would integrate with a real-time streaming solution
    // For now, return recent errors from the monitor

    const events = errorMonitor['errorEvents'] || []

    let filtered = [...events]

    if (options?.categories && options.categories.length > 0) {
      filtered = filtered.filter(e => options.categories!.includes(e.category))
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit)
    }

    return filtered.reverse() // Most recent first
  }

  // ─── Private Helper Methods ───────────────────────────────────────────

  private getErrorsByEndpoint(): Record<string, number> {
    // This would aggregate errors by endpoint
    // For now, return empty object
    return {}
  }

  private getTopErrors(): Array<{ message: string; count: number; category: string }> {
    const events = errorMonitor['errorEvents'] || []
    const errorCounts: Record<string, { count: number; category: string }> = {}

    events.forEach(event => {
      const key = event.message.substring(0, 100) // Truncate long messages
      if (!errorCounts[key]) {
        errorCounts[key] = { count: 0, category: event.category }
      }
      errorCounts[key].count++
    })

    return Object.entries(errorCounts)
      .map(([message, data]) => ({ message, count: data.count, category: data.category }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  private getTopAffectedUsers(): Array<{ userId: string; errorCount: number }> {
    const events = errorMonitor['errorEvents'] || []
    const userErrorCounts: Record<string, number> = {}

    events.forEach(event => {
      if (event.userId) {
        userErrorCounts[event.userId] = (userErrorCounts[event.userId] || 0) + 1
      }
    })

    return Object.entries(userErrorCounts)
      .map(([userId, errorCount]) => ({ userId, errorCount }))
      .sort((a, b) => b.errorCount - a.errorCount)
      .slice(0, 10)
  }

  private getErrorsByUserSegment(): Record<string, number> {
    const events = errorMonitor['errorEvents'] || []
    const segmentErrors: Record<string, number> = {}

    events.forEach(event => {
      // Define segments based on user properties
      // For now, simple categorization
      const segment = event.userId ? 'authenticated' : 'guest'
      segmentErrors[segment] = (segmentErrors[segment] || 0) + 1
    })

    return segmentErrors
  }

  private async getPerformanceMetrics(): Promise<{
    averageResponseTime: number
    errorRate: number
    throughput: number
  }> {
    // These would be calculated from actual performance data
    // For now, return placeholder values
    return {
      averageResponseTime: 0,
      errorRate: 0,
      throughput: 0
    }
  }

  private generateRecommendations(
    health: any,
    patterns: any[],
    circuitBreakers: any[]
  ): Array<{
    priority: 'high' | 'medium' | 'low'
    category: string
    action: string
    estimatedImpact: string
  }> {
    const recommendations = []

    // Health-based recommendations
    if (health.status === 'unhealthy') {
      recommendations.push({
        priority: 'high' as const,
        category: 'System Health',
        action: 'Immediate investigation required. System is unhealthy.',
        estimatedImpact: 'Critical - System may be unavailable'
      })
    } else if (health.status === 'degraded') {
      recommendations.push({
        priority: 'medium' as const,
        category: 'System Health',
        action: 'Monitor system closely. Performance is degraded.',
        estimatedImpact: 'Moderate - Users may experience slowness'
      })
    }

    // Pattern-based recommendations
    patterns.forEach(pattern => {
      if (pattern.severity === 'critical') {
        recommendations.push({
          priority: 'high' as const,
          category: pattern.category,
          action: pattern.suggestedAction,
          estimatedImpact: `Critical - ${pattern.affectedUsers} users affected`
        })
      } else if (pattern.trend === 'increasing' && pattern.frequency > 20) {
        recommendations.push({
          priority: 'medium' as const,
          category: pattern.category,
          action: `${pattern.suggestedAction} Frequency increasing.`,
          estimatedImpact: `Moderate - ${pattern.frequency} errors in current window`
        })
      }
    })

    // Circuit breaker recommendations
    const openCircuits = circuitBreakers.filter(cb => cb.state === 'OPEN')
    if (openCircuits.length > 0) {
      recommendations.push({
        priority: 'high' as const,
        category: 'Circuit Breakers',
        action: `Investigate failing services: ${openCircuits.map(c => c.service).join(', ')}`,
        estimatedImpact: 'High - These services are currently unavailable'
      })
    }

    return recommendations.slice(0, 10) // Limit to top 10 recommendations
  }
}

// ─── Alerting System ─────────────────────────────────────────────────────

export interface AlertRule {
  name: string
  condition: (data: DashboardData) => boolean
  action: (data: DashboardData) => void
  cooldownMs: number
  lastTriggered?: number
}

export class AlertingSystem {
  private static instance: AlertingSystem
  private rules: AlertRule[] = []
  private alertHistory: any[] = []

  private constructor() {
    this.initializeDefaultRules()
  }

  static getInstance(): AlertingSystem {
    if (!AlertingSystem.instance) {
      AlertingSystem.instance = new AlertingSystem()
    }
    return AlertingSystem.instance
  }

  /**
   * Add custom alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.push(rule)
  }

  /**
   * Check all alert rules against current data
   */
  async checkAlerts(): Promise<void> {
    const dashboard = ErrorDashboard.getInstance()
    const data = await dashboard.getDashboardData()

    for (const rule of this.rules) {
      try {
        const shouldTrigger = rule.condition(data)
        const now = Date.now()

        if (shouldTrigger) {
          // Check cooldown
          if (rule.lastTriggered && now - rule.lastTriggered < rule.cooldownMs) {
            continue
          }

          // Trigger alert
          await this.triggerAlert(rule, data)

          // Update last triggered time
          rule.lastTriggered = now
        }
      } catch (error) {
        logger.error({
          event: 'alert_rule_error',
          ruleName: rule.name,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  private async triggerAlert(rule: AlertRule, data: DashboardData): Promise<void> {
    logger.warn({
      event: 'alert_triggered',
      ruleName: rule.name,
      systemHealth: data.summary.status,
      timestamp: new Date().toISOString()
    })

    // Execute the alert action
    try {
      await rule.action(data)
    } catch (error) {
      logger.error({
        event: 'alert_action_failed',
        ruleName: rule.name,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    // Record in history
    this.alertHistory.push({
      ruleName: rule.name,
      timestamp: new Date().toISOString(),
      data: {
        systemHealth: data.summary.status,
        criticalErrors: data.summary.criticalErrors
      }
    })

    // Keep only recent history
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000)
    }
  }

  private initializeDefaultRules(): void {
    // Critical system health alert
    this.rules.push({
      name: 'critical_system_health',
      condition: (data) => data.summary.status === 'unhealthy',
      action: (data) => {
        logger.error({
          event: 'critical_alert',
          message: 'System is unhealthy!',
          healthScore: data.summary.systemHealthScore
        })
        // In production, this would send notifications
      },
      cooldownMs: 5 * 60 * 1000 // 5 minutes
    })

    // High error rate alert
    this.rules.push({
      name: 'high_error_rate',
      condition: (data) => {
        const criticalRatio = data.summary.criticalErrors / Math.max(1, data.summary.totalErrors)
        return criticalRatio > 0.1 // More than 10% critical errors
      },
      action: (data) => {
        logger.warn({
          event: 'high_error_rate_alert',
          criticalErrors: data.summary.criticalErrors,
          totalErrors: data.summary.totalErrors,
          ratio: data.summary.criticalErrors / Math.max(1, data.summary.totalErrors)
        })
      },
      cooldownMs: 10 * 60 * 1000 // 10 minutes
    })

    // Circuit breaker open alert
    this.rules.push({
      name: 'circuit_breaker_open',
      condition: (data) => {
        const openCircuits = data.systemMetrics.circuitBreakers.filter(
          (cb: any) => cb.state === 'OPEN'
        )
        return openCircuits.length > 0
      },
      action: (data) => {
        const openCircuits = data.systemMetrics.circuitBreakers.filter(
          (cb: any) => cb.state === 'OPEN'
        )
        logger.error({
          event: 'circuit_breaker_alert',
          openCircuits: openCircuits.map((cb: any) => cb.service)
        })
      },
      cooldownMs: 2 * 60 * 1000 // 2 minutes
    })
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit?: number): any[] {
    let history = [...this.alertHistory].reverse()

    if (limit) {
      history = history.slice(0, limit)
    }

    return history
  }
}

// ─── Scheduled Monitoring ───────────────────────────────────────────────

export class ScheduledMonitoring {
  private static instance: ScheduledMonitoring
  private intervals: NodeJS.Timeout[] = []

  private constructor() {}

  static getInstance(): ScheduledMonitoring {
    if (!ScheduledMonitoring.instance) {
      ScheduledMonitoring.instance = new ScheduledMonitoring()
    }
    return ScheduledMonitoring.instance
  }

  /**
   * Start all monitoring tasks
   */
  start(): void {
    // Check alerts every 30 seconds
    const alertInterval = setInterval(() => {
      AlertingSystem.getInstance().checkAlerts()
    }, 30000)

    // Generate health report every 5 minutes
    const reportInterval = setInterval(() => {
      this.generateHealthReport()
    }, 5 * 60 * 1000)

    // Clean old data every hour
    const cleanupInterval = setInterval(() => {
      this.cleanupOldData()
    }, 60 * 60 * 1000)

    this.intervals = [alertInterval, reportInterval, cleanupInterval]

    logger.info({
      event: 'scheduled_monitoring_started',
      tasks: this.intervals.length
    })
  }

  /**
   * Stop all monitoring tasks
   */
  stop(): void {
    this.intervals.forEach(interval => clearInterval(interval))
    this.intervals = []

    logger.info({
      event: 'scheduled_monitoring_stopped'
    })
  }

  private async generateHealthReport(): Promise<void> {
    try {
      const dashboard = ErrorDashboard.getInstance()
      const data = await dashboard.getDashboardData()

      logger.info({
        event: 'health_report',
        systemHealth: data.summary.status,
        healthScore: data.summary.systemHealthScore,
        totalErrors: data.summary.totalErrors,
        criticalErrors: data.summary.criticalErrors
      })
    } catch (error) {
      logger.error({
        event: 'health_report_failed',
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private cleanupOldData(): void {
    // Clean up old error events, alert history, etc.
    // This would be implemented based on retention policies

    logger.info({
      event: 'data_cleanup_completed'
    })
  }
}

// Export singleton instances
export const errorDashboard = ErrorDashboard.getInstance()
export const alertingSystem = AlertingSystem.getInstance()
export const scheduledMonitoring = ScheduledMonitoring.getInstance()