import { pgTable, text, timestamp, boolean, integer, bigint } from 'drizzle-orm/pg-core'
import { users } from './user.schema'
import { relations } from 'drizzle-orm'
import { storageBuckets } from './storage.schema'
import { generateShortId } from '../utils/short-id'

export const videos = pgTable('videos', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  shortId: text('short_id').unique().notNull().$defaultFn(() => generateShortId(8)),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  videoUrl: text('video_url').notNull(),
  hlsPath: text('hls_path'),
  thumbnailPath: text('thumbnail_path'),
  status: text('status').notNull().default('pending'), // pending, uploading, processing, ready, error
  errorMessage: text('error_message'), // Stores last processing error for frontend display
  duration: integer('duration'),
  visibility: text('visibility').notNull().default('private'), // 'private' | 'unlisted' | 'public'
  isPrivate: boolean('is_private').notNull().default(false), // Legacy compat — derived from visibility
  folderId: text('folder_id'), // Relates to folders schema, null means root
  bucketId: text('bucket_id').references(() => storageBuckets.id, { onDelete: 'set null' }),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }).notNull().default(0),
  views: integer('views').notNull().default(0), // Fast telemetry store
  processingMode: text('processing_mode').notNull().default('mp4'), // 'mp4' | 'hls'
  qualities: text('qualities').array().notNull().default(['720p']), // e.g. ['360p', '720p', '1080p', '4k']
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const videosRelations = relations(videos, ({ one }) => ({
  user: one(users, {
    fields: [videos.userId],
    references: [users.id],
  }),
  // Circular dependency to import folder schema is generally fine in drizzle if we structure correctly
  // but to prevent circular refs, we wait until index.ts is unified
}))
