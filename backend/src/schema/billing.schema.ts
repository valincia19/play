import { pgTable, text, timestamp, pgEnum, integer, jsonb } from 'drizzle-orm/pg-core'
import { users } from './user.schema'
import { relations } from 'drizzle-orm'

export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'canceled', 'expired'])
export const transactionStatusEnum = pgEnum('transaction_status', ['success', 'failed'])
export const transactionTypeEnum = pgEnum('transaction_type', ['purchase', 'give', 'renew'])

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(),
  maxVideos: integer('max_videos').notNull().default(-1),
  maxStorage: integer('max_storage').notNull().default(-1),
  maxBandwidth: integer('max_bandwidth').notNull().default(-1),
  capabilities: jsonb('capabilities').$type<Record<string, boolean>>().notNull().default({}),
  planVersion: integer('plan_version').notNull().default(1),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: text('plan_id').notNull(),
  amount: integer('amount').notNull(), // amount in IDR/cents depending on future integration
  type: transactionTypeEnum('type').notNull().default('purchase'),
  status: transactionStatusEnum('status').notNull().default('success'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}))

