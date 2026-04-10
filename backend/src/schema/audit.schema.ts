import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'
import { users } from './user.schema'
import crypto from 'crypto'

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  adminId: text('admin_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
