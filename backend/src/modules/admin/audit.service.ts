import { db, adminAuditLogs } from '../../schema'
import type { DbTransaction } from '../../schema/db'
import { and, desc, eq } from 'drizzle-orm'

type TxOrDb = typeof db | DbTransaction

class AdminAuditService {
  async logAudit(txOrDb: TxOrDb, adminId: string, action: string, targetType: string, targetId: string, payload?: object) {
    await (txOrDb as DbTransaction).insert(adminAuditLogs).values({
      adminId,
      action,
      targetType,
      targetId,
      payload: payload ?? null,
    })
  }

  async getAuditLogs(filters: { adminId?: string, action?: string, targetType?: string, targetId?: string }, limit: number = 50, offset: number = 0) {
    const conditions = []
    if (filters.adminId) conditions.push(eq(adminAuditLogs.adminId, filters.adminId))
    if (filters.action) conditions.push(eq(adminAuditLogs.action, filters.action))
    if (filters.targetType) conditions.push(eq(adminAuditLogs.targetType, filters.targetType))
    if (filters.targetId) conditions.push(eq(adminAuditLogs.targetId, filters.targetId))

    return await db.query.adminAuditLogs.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(adminAuditLogs.createdAt)],
      limit,
      offset,
      with: {
        adminUser: { columns: { email: true, name: true } }
      }
    })
  }
}

export const adminAuditService = new AdminAuditService()
