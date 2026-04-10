import { pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const blogStatusEnum = pgEnum('blog_status', ['draft', 'published'])

export const blogPosts = pgTable('blog_posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  coverImageUrl: text('cover_image_url'),
  excerpt: text('excerpt').notNull().default(''),
  content: text('content').notNull().default(''),
  category: text('category').notNull().default('General'),
  status: blogStatusEnum('status').notNull().default('draft'),
  authorId: text('author_id').notNull(),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type BlogPost = typeof blogPosts.$inferSelect
export type NewBlogPost = typeof blogPosts.$inferInsert
