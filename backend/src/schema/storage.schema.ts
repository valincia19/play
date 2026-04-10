import { pgTable, text, integer, boolean, timestamp, bigint } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const storageProviders = pgTable('storage_providers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text('type').notNull(), // 'r2' | 's3'
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const storageBuckets = pgTable('storage_buckets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: text('provider_id').notNull().references(() => storageProviders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  region: text('region'),
  endpoint: text('endpoint'),
  accessKey: text('access_key').notNull(),
  secretKey: text('secret_key').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  status: text('status').default('online').notNull(), // 'online' | 'offline' | 'degraded'
  encryptionVersion: integer('encryption_version').default(1).notNull(),
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }).notNull().default(0),
  usedStorageBytes: bigint('used_storage_bytes', { mode: 'number' }).notNull().default(0),
  lastHealthCheckAt: timestamp('last_health_check_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
