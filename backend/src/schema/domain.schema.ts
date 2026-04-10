import { pgTable, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const sslStatusEnum = pgEnum('ssl_status', ['pending', 'active', 'error'])

export const domains = pgTable('domains', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain').notNull().unique(),
  isDefault: boolean('is_default').default(false).notNull(),
  isVerified: boolean('is_verified').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  sslStatus: sslStatusEnum('ssl_status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type Domain = typeof domains.$inferSelect
export type NewDomain = typeof domains.$inferInsert
