import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core'
import { users } from './user.schema'

export const adSettings = pgTable('ad_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }), // removed unique()
  provider: text('provider').notNull().default('adsterra'),
  adType: text('ad_type').notNull().default('smart_link'),
  adCode: text('ad_code').notNull().default(''),
  isActive: boolean('is_active').notNull().default(false),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type AdSettings = typeof adSettings.$inferSelect
export type NewAdSettings = typeof adSettings.$inferInsert
