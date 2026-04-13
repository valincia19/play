/**
 * Error Monitoring Dashboard Routes
 * Provides admin endpoints for error monitoring and system health
 */

import { Elysia, t } from 'elysia'
import { errorDashboard, alertingSystem, scheduledMonitoring } from '../utils/error-dashboard'
import { errorMonitor } from '../utils/error-monitor'
import { recoveryManager } from '../utils/error-recovery'
import { CircuitBreakerRegistry } from '../utils/circuit-breaker'
import { requireAdminUser } from '../modules/admin/context'
import { logger } from '../utils/logger'
import type { ErrorCategory } from '../utils/error-handler'
import { env } from '../config/env'

export const errorMonitoringRoutes = new Elysia({ prefix: '/admin/error-monitoring' })

  // ─── Dashboard Data ───────────────────────────────────────────────
  .get('/dashboard', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      const dashboardData = await errorDashboard.getDashboardData()
      return { success: true, data: dashboardData }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_dashboard_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard data' } }
    }
  })

  // ─── System Health ────────────────────────────────────────────────
  .get('/health', async () => {
    try {
      const health = errorMonitor.getSystemHealth()
      const metrics = errorMonitor.getMetrics()

      return {
        success: true,
        data: {
          ...health,
          metrics: {
            totalErrors: metrics.totalErrors,
            criticalErrorRate: metrics.criticalErrorRate,
            userImpact: metrics.userImpactScore
          }
        }
      }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_health_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch health data' } }
    }
  })

  // ─── Error Patterns ────────────────────────────────────────────────
  .get('/patterns', async () => {
    try {
      const patterns = errorMonitor.detectPatterns()
      return { success: true, data: patterns }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_patterns_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to analyze error patterns' } }
    }
  })

  // ─── Circuit Breaker Status ────────────────────────────────────────
  .get('/circuit-breakers', async () => {
    try {
      const circuitBreakers = CircuitBreakerRegistry.getInstance().getAllStatuses()
      return { success: true, data: circuitBreakers }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_circuit_breakers_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch circuit breaker status' } }
    }
  })

  // ─── Reset Circuit Breaker ────────────────────────────────────────
  .post('/circuit-breakers/:service/reset', async ({ params, request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      const registry = CircuitBreakerRegistry.getInstance()
      registry.reset(params.service)

      logger.info({
        event: 'circuit_breaker_reset',
        service: params.service,
        admin: auth.adminUser.id
      })

      return { success: true, message: `Circuit breaker for ${params.service} has been reset` }
    } catch (err) {
      logger.error({
        event: 'circuit_breaker_reset_failed',
        service: params.service,
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to reset circuit breaker' } }
    }
  })

  // ─── Recovery Statistics ───────────────────────────────────────────
  .get('/recovery-stats', async () => {
    try {
      const stats = recoveryManager.getRecoveryStats()
      return { success: true, data: stats }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_recovery_stats_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch recovery statistics' } }
    }
  })

  // ─── Error Stream ──────────────────────────────────────────────────
  .get('/error-stream', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      const url = new URL(request.url)
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const categories = url.searchParams.get('categories')?.split(',')

      const errorStream = errorDashboard.getErrorStream({ limit, categories })
      return { success: true, data: errorStream }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_stream_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch error stream' } }
    }
  })

  // ─── Generate Report ────────────────────────────────────────────────
  .get('/report', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      const url = new URL(request.url)
      const hours = parseInt(url.searchParams.get('hours') || '24')

      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000)

      const report = await errorDashboard.generateReport(startDate, endDate)
      return { success: true, data: report }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_report_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to generate error report' } }
    }
  })

  // ─── Alert History ──────────────────────────────────────────────────
  .get('/alerts', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      const url = new URL(request.url)
      const limit = parseInt(url.searchParams.get('limit') || '50')

      const alertHistory = alertingSystem.getAlertHistory(limit)
      return { success: true, data: alertHistory }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_alerts_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch alert history' } }
    }
  })

  // ─── Monitoring Control ─────────────────────────────────────────────
  .post('/monitoring/start', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      scheduledMonitoring.start()

      logger.info({
        event: 'error_monitoring_started',
        admin: auth.adminUser.id
      })

      return { success: true, message: 'Error monitoring has been started' }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_start_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to start error monitoring' } }
    }
  })

  .post('/monitoring/stop', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    try {
      scheduledMonitoring.stop()

      logger.info({
        event: 'error_monitoring_stopped',
        admin: auth.adminUser.id
      })

      return { success: true, message: 'Error monitoring has been stopped' }
    } catch (err) {
      logger.error({
        event: 'error_monitoring_stop_failed',
        error: err instanceof Error ? err.message : String(err)
      })
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to stop error monitoring' } }
    }
  })

  .post('/test-error', async ({ body }) => {
    if (env.nodeEnv === 'production') {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Error testing disabled in production' } }
    }

    try {
      const { type, message } = body

      errorMonitor.recordError({
        timestamp: new Date().toISOString(),
        category: (type || 'internal') as ErrorCategory,
        code: 'TEST_ERROR',
        message: message || 'Test error message',
        recovered: false,
        correlationId: errorMonitor.generateCorrelationId()
      })

      return { success: true, message: 'Test error recorded successfully' }
    } catch (err) {
      return { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to record test error' } }
    }
  }, {
    body: t.Object({
      type: t.Optional(t.String()),
      message: t.Optional(t.String())
    })
  })