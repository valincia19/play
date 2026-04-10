import { Elysia, t } from 'elysia'
import { adminService } from './service'
import { billingService } from '../billing'
import { success } from '../../utils/response'
import { db } from '../../schema'
import { requireAdminUser } from './context'

export const adminBillingRoutes = new Elysia()
  .post('/give-plan', async ({ request, status, body }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const { userId, planId, durationDaysOverride } = body as { userId: string, planId: string, durationDaysOverride?: number }
    const result = await adminService.givePlan(auth.adminUser.id, userId, planId, durationDaysOverride)
    return success(result)
  }, {
    body: t.Object({
      userId: t.String(),
      planId: t.String(),
      durationDaysOverride: t.Optional(t.Number())
    })
  })
  .get('/transactions', async () => {
    const tx = await adminService.getAllTransactions()
    return success(tx)
  })
  .get('/plans', async () => {
    const plans = await adminService.getAllPlans()
    return success(plans)
  })
  .post('/plans', async ({ body }) => {
    const result = await billingService.createPlanTemplate(body as any)
    return success(result)
  }, {
    body: t.Object({
      id: t.String(),
      name: t.String(),
      price: t.Number(),
      maxVideos: t.Number(),
      maxStorage: t.Number(),
      maxBandwidth: t.Number(),
      durationDays: t.Number(),
      isActive: t.Optional(t.Boolean()),
      position: t.Optional(t.Number()),
      features: t.Array(t.Object({ label: t.String(), highlight: t.Optional(t.Boolean()) })),
      capabilities: t.Optional(t.Any()),
    })
  })
  .put('/plans/:id', async ({ params, body }) => {
    const result = await billingService.updatePlanTemplate(params.id, body as any)
    return success(result)
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      price: t.Optional(t.Number()),
      maxVideos: t.Optional(t.Number()),
      maxStorage: t.Optional(t.Number()),
      maxBandwidth: t.Optional(t.Number()),
      durationDays: t.Optional(t.Number()),
      isActive: t.Optional(t.Boolean()),
      position: t.Optional(t.Number()),
      features: t.Optional(t.Array(t.Object({ label: t.String(), highlight: t.Optional(t.Boolean()) }))),
      capabilities: t.Optional(t.Any()),
    })
  })
  .delete('/plans/:id', async ({ request, status, params }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const result = await billingService.deletePlanTemplate(params.id)
    await adminService.logAudit(db, auth.adminUser.id, 'DELETE_PLAN', 'plan', params.id)
    return success(result)
  })
