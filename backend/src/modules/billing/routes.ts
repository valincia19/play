import { Elysia, t } from 'elysia'
import { billingService } from './service'
import { enforceAuthenticatedContext, resolveAuthenticatedContext } from '../auth'
import { success } from '../../utils/response'

export const billingRoutes = new Elysia({ prefix: '/billing' })
  .resolve(resolveAuthenticatedContext)
  .onBeforeHandle(enforceAuthenticatedContext)
  // GET: Retrieve Subscription Status
  .get(
    '/subscription',
    async ({ userId }) => {
      const sub = await billingService.getSubscription(userId!)
      return success(sub)
    }
  )
  // GET: Retrieve Transaction History
  .get(
    '/history',
    async ({ userId }) => {
      const history = await billingService.getHistory(userId!)
      return success(history)
    }
  )
  // POST: Upgrade Plan
  .post(
    '/upgrade',
    async ({ userId, body }) => {
      const result = await billingService.upgradePlan(userId!, body.plan)
      return success(result)
    },
    {
      body: t.Object({
        plan: t.String()
      })
    }
  )

export const publicBillingRoutes = new Elysia({ prefix: '/billing' })
  .get('/plans', async () => {
    const plans = await billingService.getPlans()
    return success(plans)
  })
