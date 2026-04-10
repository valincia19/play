import { db, plans, subscriptions, transactions, users } from '../../schema'
import { desc, eq } from 'drizzle-orm'
import { redisManager } from '../../utils/redis'
import { logger } from '../../utils/logger'
import { adminAuditService } from './audit.service'

class AdminBillingService {
  async getAllPlans() {
    return await db.query.plans.findMany({
      orderBy: [desc(plans.position)],
    })
  }

  async getAllTransactions() {
    return await db.query.transactions.findMany({
      orderBy: [desc(transactions.createdAt)],
      with: {
        user: { columns: { email: true, name: true } }
      }
    })
  }

  async givePlan(adminId: string, userId: string, planId: string, durationDaysOverride?: number) {
    try {
      const targetPlan = await db.query.plans.findFirst({ where: eq(plans.id, planId) })
      if (!targetPlan) throw new Error('Plan not found')

      const duration = durationDaysOverride || targetPlan.durationDays
      const endDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000)

      await db.transaction(async (tx) => {
        await tx.delete(subscriptions)
          .where(eq(subscriptions.userId, userId))

        await tx.insert(subscriptions).values({
          userId,
          planId,
          status: 'active',
          maxVideos: targetPlan.maxVideos,
          maxStorage: targetPlan.maxStorage,
          maxBandwidth: targetPlan.maxBandwidth,
          capabilities: targetPlan.capabilities as Record<string, boolean>,
          planVersion: targetPlan.version,
          endDate
        })

        await tx.update(users).set({ plan: planId }).where(eq(users.id, userId))

        await adminAuditService.logAudit(tx, adminId, 'GIVE_PLAN', 'user', userId, {
          planId, durationDays: duration
        })
      })

      await redisManager.del(`subscription:${userId}`)
      await redisManager.publish('events:subscription_updated', { userId, planId })

      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error({ event: 'admin_give_plan_failed', error: message, stack: err instanceof Error ? err.stack : undefined, userId, planId })
      throw err
    }
  }
}

export const adminBillingService = new AdminBillingService()
