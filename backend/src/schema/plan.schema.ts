import { pgTable, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const plans = pgTable('plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  price: integer('price').notNull(),
  maxVideos: integer('max_videos').notNull().default(-1), // -1 means unlimited
  maxStorage: integer('max_storage').notNull().default(-1), // in megabytes
  maxBandwidth: integer('max_bandwidth').notNull().default(-1), // in megabytes
  durationDays: integer('duration_days').notNull().default(30),
  features: jsonb('features').$type<Array<{label: string, highlight?: boolean}>>().notNull().default([]),
  capabilities: jsonb('capabilities').$type<Record<string, boolean>>().notNull().default({}),
  position: integer('position').notNull().default(0),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
 