import { db, users, subscriptions, transactions, plans } from '../../schema'
import type { DbTransaction } from '../../schema'
import { eq, desc, and, lt, sql, asc } from 'drizzle-orm'
import { error, errorCodes } from '../../utils/response'
import { logger } from '../../utils/logger'
import { redisManager } from '../../utils/redis'

export interface UpgradePlanResult {
  message: string
}

class BillingService {
  /**
   * Upgrades a user's plan. Mocks a payment transaction.
   */
  async upgradePlan(userId: string, newPlanId: string): Promise<UpgradePlanResult> {
    // 1. Get user and target plan
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId)
    })

    if (!user) {
      throw error(errorCodes.USER_NOT_FOUND, 'User not found')
    }

    if (user.plan === newPlanId) {
      throw error(errorCodes.INVALID_INPUT, `You are already on this plan`)
    }

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, newPlanId)
    })

    if (!plan) {
      throw error(errorCodes.INVALID_INPUT, 'Invalid plan selected')
    }

    const amount = plan.price

    try {
      // Begin transaction
      await db.transaction(async (tx: DbTransaction) => {
        // 2. Create transaction record (mock payment success)
        await tx.insert(transactions).values({
          userId: user.id,
          planId: newPlanId,
          amount: amount,
          type: 'purchase',
          status: 'success',
        })

        // 3. Cancel ALL existing subs for this user, then create clean active one
        const now = new Date()
        const endDate = new Date()
        endDate.setDate(endDate.getDate() + (plan.durationDays || 30))

        // Wipe all old subscriptions (expired, active, canceled) — single source of truth
        await tx.delete(subscriptions)
          .where(eq(subscriptions.userId, user.id))

        // Create fresh active subscription snapshot
        await tx.insert(subscriptions).values({
          userId: user.id,
          planId: newPlanId,
          status: 'active',
          startDate: now,
          endDate: endDate,
          maxVideos: plan.maxVideos,
          maxStorage: plan.maxStorage,
          maxBandwidth: plan.maxBandwidth,
          capabilities: plan.capabilities as Record<string, boolean>,
          planVersion: plan.version
        })

        // 4. Update user profile plan
        await tx.update(users)
          .set({ plan: newPlanId })
          .where(eq(users.id, user.id))
      })

      logger.info({
        event: 'plan_upgrade_success',
        data: { userId, newPlanId, amount }
      })

      // Invalidate target sub cache and trigger realtime event hook
      await redisManager.del(`subscription:${userId}`)
      await redisManager.publish('events:subscription_updated', { userId, newPlanId })

      return { message: `Successfully upgraded to ${plan.name} plan` }

    } catch (err: unknown) {
      logger.error({
        event: 'plan_upgrade_failed',
        error: err,
        stack: err.stack
      })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to process upgrade transaction')
    }
  }

  /**
   * Process expired subscriptions and gracefully downgrade users back to the free plan.
   * Can be hooked into a cron job.
   */
  async processExpiredSubscriptions() {
    try {
      const now = new Date()
      const expiredSubs = await db.query.subscriptions.findMany({
        where: and(
          lt(subscriptions.endDate, now),
          eq(subscriptions.status, 'active')
        )
      })

      for (const sub of expiredSubs) {
        await db.transaction(async (tx: DbTransaction) => {
          // 1. Wipe ALL subscriptions for this user (single source of truth)
          await tx.delete(subscriptions)
            .where(eq(subscriptions.userId, sub.userId))

          // 2. Downgrade user to generic 'free' plan
          await tx.update(users)
            .set({ plan: 'free' })
            .where(eq(users.id, sub.userId))
          
          // 3. Re-assign a clean free snapshot
          const freePlan = await db.query.plans.findFirst({ where: eq(plans.id, 'free') })
          if (freePlan) {
            await tx.insert(subscriptions).values({
              userId: sub.userId,
              planId: 'free',
              status: 'active',
              maxVideos: freePlan.maxVideos,
              maxStorage: freePlan.maxStorage,
              maxBandwidth: freePlan.maxBandwidth,
              endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            })
          }

          // 4. Log transaction
          await tx.insert(transactions).values({
            userId: sub.userId,
            planId: 'free',
            amount: 0,
            type: 'renew',
            status: 'success',
          })
        })

        // Invalidate cached subscription so billing page refreshes
        await redisManager.del(`subscription:${sub.userId}`)

        logger.info({
          event: 'subscription_expired',
          data: { userId: sub.userId, previousPlanId: sub.planId }
        }, `Expired subscription for userId: ${sub.userId}, Plan: ${sub.planId}`)
      }
      return expiredSubs.length
    } catch (err: unknown) {
      logger.error({ event: 'process_expired_subscriptions_failed', error: err, stack: (err as any)?.stack })
    }
  }

  /**
   * Gets the active subscription details for a user.
   * Prioritizes active status, falls back to most recent.
   */
  async getSubscription(userId: string) {
    return redisManager.getOrSet(`subscription:${userId}`, 30, async () => {
      // Priority 1: active subscription
      const activeSub = await db.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ),
        orderBy: [desc(subscriptions.createdAt)]
      })
      if (activeSub) return activeSub

      // Priority 2: most recent subscription (any status) — for display purposes
      const anySub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, userId),
        orderBy: [desc(subscriptions.createdAt)]
      })
      return anySub || null
    })
  }

  /**
   * Gets the transaction history for a user
   */
  async getHistory(userId: string) {
    return db.query.transactions.findMany({
      where: eq(transactions.userId, userId),
      orderBy: [desc(transactions.createdAt)]
    })
  }

  /**
   * Fetch all active plans.
   */
  async getPlans() {
    const redis = await redisManager.getClient()
    const CACHE_KEY = `vercelplay:plans:active`
    
    // Check cache
    const cached = await redis.get(CACHE_KEY)
    if (cached) {
      return JSON.parse(cached)
    }

    // Cache miss - query DB
    const activePlans = await db.query.plans.findMany({
      where: eq(plans.isActive, true),
      orderBy: [asc(plans.position)]
    })

    // Store in cache for 1 hour (3600 seconds)
    await redis.set(CACHE_KEY, JSON.stringify(activePlans), 'EX', 3600)
    
    return activePlans
  }

  /**
   * System API: Invalidate Plans Cache manually (e.g., when Admin modifies plans)
   */
  async invalidatePlansCache() {
    const redis = await redisManager.getClient()
    await redis.del(`vercelplay:plans:active`)
    logger.info({ event: 'plans_cache_invalidated', message: 'Admin forced cache refresh' })
  }

  /**
   * Check if a specific capability is turned on for the user's current subscription.
   */
  async hasCapability(userId: string, capability: string): Promise<boolean> {
    const sub = await this.getSubscription(userId)
    if (!sub || sub.status !== 'active') return false

    const caps = (sub.capabilities as Record<string, boolean>) || {}
    return !!caps[capability]
  }
  /**
   * Admin API: Add new Plan Template
   */
  async createPlanTemplate(planData: typeof plans.$inferInsert) {
    const result = await db.insert(plans).values(planData).returning()
    await this.invalidatePlansCache()
    return result[0]
  }

  /**
   * Admin API: Update a Plan Template
   */
  async updatePlanTemplate(planId: string, planData: Partial<typeof plans.$inferInsert>) {
    const result = await db.update(plans).set({ ...planData, updatedAt: new Date() }).where(eq(plans.id, planId)).returning()
    await this.invalidatePlansCache()
    return result[0]
  }

  /**
   * Admin API: Delete/Deactivate Plan Template
   */
  async deletePlanTemplate(planId: string) {
    const result = await db.update(plans).set({ isActive: false, updatedAt: new Date() }).where(eq(plans.id, planId)).returning()
    await this.invalidatePlansCache()
    return result[0]
  }
}

export const billingService = new BillingService()
