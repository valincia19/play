import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core'
import { users } from './user.schema'
import { relations } from 'drizzle-orm'
import { generateShortId } from '../utils/short-id'

export const folders = pgTable('folders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shortId: text('short_id').unique().notNull().$defaultFn(() => generateShortId(8)),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  path: text('path').notNull().default(''),
  depth: integer('depth').notNull().default(0),
  visibility: text('visibility').notNull().default('private'), // 'private' | 'unlisted' | 'public'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const foldersRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'parent_child'
  }),
  children: many(folders, { relationName: 'parent_child' })
}))
