import { db, subscriptions, users, plans } from '../../schema'
import { and, desc, eq, ne, sql } from 'drizzle-orm'
import { adminAuditService } from './audit.service'
import { hashPassword } from '../../utils/crypto'
import { redisManager } from '../../utils/redis'
import { logger } from '../../utils/logger'

class AdminUserService {
  async getAllUsers() {
    const results = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      plan: users.plan,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
      planStartDate: subscriptions.startDate,
      planEndDate: subscriptions.endDate,
    })
      .from(users)
      .leftJoin(subscriptions, sql`${users.id} = ${subscriptions.userId} AND ${subscriptions.status} = 'active'`)
      .orderBy(desc(users.createdAt))

    return results
  }

  async updateUser(
    adminId: string,
    userId: string,
    data: {
      name?: string
      email?: string
      password?: string
      role?: 'user' | 'admin'
      status?: 'active' | 'suspended'
      plan?: string
      planStartDate?: string
      planEndDate?: string
    }
  ) {
    logger.info({ adminId, userId, data }, '[AdminUserService] updateUser called')

    // ── 0. Guard: reject completely empty payloads ───────────────
    const hasAnyField = Object.values(data).some(v => v !== undefined && v !== null && v !== '')
    if (!hasAnyField) {
      throw Object.assign(new Error('No fields provided to update'), { code: 'INVALID_INPUT' })
    }

    // ── 0b. Guard: prevent admin self-demotion ───────────────────
    if (adminId === userId) {
      if (data.role === 'user') {
        throw Object.assign(new Error('Cannot remove your own admin role'), { code: 'INVALID_INPUT' })
      }
      if (data.status === 'suspended') {
        throw Object.assign(new Error('Cannot suspend your own account'), { code: 'INVALID_INPUT' })
      }
    }

    // ── 1. Normalize inputs ──────────────────────────────────────
    const nameToSet = data.name?.trim() || undefined
    const emailToSet = data.email?.trim().toLowerCase() || undefined
    const passwordRaw = data.password?.trim() || undefined

    // ── 2. Validate email uniqueness ─────────────────────────────
    if (emailToSet) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, emailToSet), ne(users.id, userId)))
        .limit(1)

      if (existing.length > 0) {
        throw Object.assign(new Error('Email is already used by another user'), { code: 'EMAIL_EXISTS' })
      }
    }

    // ── 3. Hash password if provided ─────────────────────────────
    const passwordHashValue = passwordRaw ? await hashPassword(passwordRaw) : undefined

    // ── 4. Parse dates ───────────────────────────────────────────
    const startDate = data.planStartDate ? new Date(data.planStartDate) : undefined
    if (startDate && isNaN(startDate.getTime())) {
      throw Object.assign(new Error('Invalid plan start date'), { code: 'INVALID_INPUT' })
    }
    const endDate = data.planEndDate ? new Date(data.planEndDate) : undefined
    if (endDate && isNaN(endDate.getTime())) {
      throw Object.assign(new Error('Invalid plan end date'), { code: 'INVALID_INPUT' })
    }

    // ── 5. Build the users table SET clause explicitly ────────────
    const userUpdate: Record<string, unknown> = {}
    if (nameToSet !== undefined)         userUpdate.name = nameToSet
    if (emailToSet !== undefined)        userUpdate.email = emailToSet
    if (passwordHashValue !== undefined) userUpdate.passwordHash = passwordHashValue
    if (data.role !== undefined)         userUpdate.role = data.role
    if (data.status !== undefined)       userUpdate.status = data.status
    if (data.plan !== undefined)         userUpdate.plan = data.plan

    logger.info({ userUpdate, hasDates: !!(startDate || endDate), userId }, '[AdminUserService] userUpdate payload built')

    // ── 6. Verify user exists before attempting update ───────────
    const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1)
    if (!targetUser) {
      throw Object.assign(new Error('User not found'), { code: 'INVALID_INPUT' })
    }

    // ── 7. Execute everything in a single transaction ────────────
    let userRowsUpdated = 0

    await db.transaction(async (tx) => {
      // 7a. Update user record
      if (Object.keys(userUpdate).length > 0) {
        const updated = await tx.update(users)
          .set(userUpdate)
          .where(eq(users.id, userId))
          .returning({ id: users.id })

        userRowsUpdated = updated.length
        logger.info({ updatedRows: updated.length, userId }, '[AdminUserService] users table updated')

        if (updated.length === 0) {
          logger.error({ userId, userUpdate }, '[AdminUserService] UPDATE returned 0 rows — user may not exist')
          throw Object.assign(new Error('User not found or update failed'), { code: 'INVALID_INPUT' })
        }
      }

      // 7b. Handle subscription changes
      if (data.plan === 'free') {
        // Downgrade to free → delete all active subscriptions
        await tx.delete(subscriptions).where(eq(subscriptions.userId, userId))
        logger.info({ userId }, '[AdminUserService] subscriptions deleted (free plan)')

      } else if (data.plan && data.plan !== 'free') {
        // Switching to a paid plan → upsert subscription
        const [targetPlan] = await tx.select().from(plans).where(eq(plans.id, data.plan)).limit(1)

        if (targetPlan) {
          const [existingSub] = await tx.select({ id: subscriptions.id })
            .from(subscriptions)
            .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))
            .limit(1)

          if (existingSub) {
            // Update existing subscription
            await tx.update(subscriptions)
              .set({
                planId: data.plan,
                maxVideos: targetPlan.maxVideos,
                maxStorage: targetPlan.maxStorage,
                maxBandwidth: targetPlan.maxBandwidth,
                capabilities: targetPlan.capabilities as Record<string, boolean>,
                planVersion: targetPlan.version,
                ...(startDate ? { startDate } : {}),
                ...(endDate ? { endDate } : {}),
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.id, existingSub.id))

            logger.info({ userId, subId: existingSub.id }, '[AdminUserService] subscription updated')
          } else {
            // Insert new subscription
            const newStartDate = startDate || new Date()
            const newEndDate = endDate || new Date(Date.now() + targetPlan.durationDays * 24 * 60 * 60 * 1000)

            await tx.insert(subscriptions).values({
              userId,
              planId: data.plan,
              status: 'active',
              maxVideos: targetPlan.maxVideos,
              maxStorage: targetPlan.maxStorage,
              maxBandwidth: targetPlan.maxBandwidth,
              capabilities: targetPlan.capabilities as Record<string, boolean>,
              planVersion: targetPlan.version,
              startDate: newStartDate,
              endDate: newEndDate,
            })

            logger.info({ userId, planId: data.plan }, '[AdminUserService] subscription inserted')
          }
        } else {
          logger.warn({ planId: data.plan }, '[AdminUserService] target plan not found in DB')
          throw Object.assign(new Error(`Plan '${data.plan}' not found`), { code: 'INVALID_INPUT' })
        }

      } else if (startDate || endDate) {
        // No plan change, but date range changed → update existing subscription dates
        await tx.update(subscriptions)
          .set({
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')))

        logger.info({ userId, startDate, endDate }, '[AdminUserService] subscription dates updated')
      }

      // 7c. Audit log
      await adminAuditService.logAudit(tx, adminId, 'UPDATE_USER', 'user', userId, {
        changes: userUpdate,
        dates: { startDate: startDate?.toISOString(), endDate: endDate?.toISOString() },
      })
    })

    // ── 8. Invalidate Redis cache ────────────────────────────────
    if (data.plan || startDate || endDate) {
      try {
        await redisManager.del(`subscription:${userId}`)
        if (data.plan) {
          await redisManager.publish('events:subscription_updated', { userId, planId: data.plan })
        }
      } catch (err) {
        logger.warn({ err, userId }, '[AdminUserService] Redis cache invalidation failed (non-fatal)')
      }
    }

    logger.info({ userId, userRowsUpdated }, '[AdminUserService] updateUser completed successfully')
    return { message: 'User updated', rowsAffected: userRowsUpdated }
  }

  async deleteUser(adminId: string, userId: string) {
    if (adminId === userId) {
      throw Object.assign(new Error('Cannot delete your own admin account'), { code: 'INVALID_INPUT' })
    }

    await db.transaction(async (tx) => {
      const updated = await tx.update(users)
        .set({ status: 'suspended', deletedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id })
      
      if (updated.length === 0) {
        throw Object.assign(new Error('User not found or update failed'), { code: 'INVALID_INPUT' })
      }

      await adminAuditService.logAudit(tx, adminId, 'SOFT_DELETE_USER', 'user', userId, { status: 'suspended', deletedAt: new Date() })
    })

    return { success: true }
  }
}

export const adminUserService = new AdminUserService()
