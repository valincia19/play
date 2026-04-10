import { Elysia, t } from 'elysia'
import { analyticsService } from './service'
import { resolveAuthenticatedContext, enforceAuthenticatedContext } from '../auth'

export const analyticsRoutes = new Elysia({ prefix: '/analytics' })
  .resolve(resolveAuthenticatedContext)
  .onBeforeHandle(enforceAuthenticatedContext)
  .get('/overview', async ({ userId, query }) => {
    return {
      success: true,
      data: await analyticsService.getOverview(userId!, query.from, query.to)
    }
  }, {
    query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })
  })
  .get('/views', async ({ userId, query }) => {
    return {
      success: true,
      data: await analyticsService.getViewsAnalytics(userId!, query.from, query.to)
    }
  }, {
    query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })
  })
  .get('/ads', async ({ userId, query }) => {
    return {
      success: true,
      data: await analyticsService.getAdsAnalytics(userId!, query.from, query.to)
    }
  }, {
    query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })
  })
  .get('/videos', async ({ userId, query }) => {
    return {
      success: true,
      data: await analyticsService.getTopVideos(userId!, query.from, query.to)
    }
  }, {
    query: t.Object({ from: t.Optional(t.String()), to: t.Optional(t.String()) })
  })
