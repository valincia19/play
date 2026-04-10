import { pgTable, text, timestamp, uniqueIndex, jsonb, index, bigint, integer } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { videos } from './video.schema'
import { users } from './user.schema'

export const trackingEvents = pgTable('tracking_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  videoId: text('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // 'view', 'ad_impression'
  sessionId: text('session_id').notNull(),
  viewerFingerprint: text('viewer_fingerprint'), // hash(ip + userAgent) — server-generated
  metadata: jsonb('metadata'), // JSONB for fast indexing/querying
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => {
  return {
    // VIEW dedup: 1 view per video per viewer fingerprint
    uniqueViewPerViewer: uniqueIndex('idx_unique_view_per_viewer')
      .on(table.videoId, table.viewerFingerprint)
      .where(sql`${table.eventType} = 'view'`),
    // AD IMPRESSION dedup: per video × provider × session
    uniqueAdPerProvider: uniqueIndex('idx_unique_ad_per_provider')
      .on(table.videoId, table.sessionId, table.metadata)
      .where(sql`${table.eventType} = 'ad_impression'`),
    // WATCH PROGRESS: 1 record per session (updated continuously)
    uniqueWatchPerSession: uniqueIndex('idx_unique_watch_per_session')
      .on(table.videoId, table.sessionId)
      .where(sql`${table.eventType} = 'watch_progress'`),
    // Performance indexes
    idxVideoId: index('idx_tracking_video_id').on(table.videoId),
    idxEventType: index('idx_tracking_event_type').on(table.eventType),
    idxCreatedAt: index('idx_tracking_created_at').on(table.createdAt),
    idxFingerprint: index('idx_tracking_fingerprint').on(table.viewerFingerprint),
  }
})

// ── Weekly Bandwidth Usage ──────────────────────────────────────
// Tracks actual bytes served per user per week for quota enforcement.
export const bandwidthUsage = pgTable('bandwidth_usage', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  weekKey: text('week_key').notNull(), // e.g. "2026-W15"
  usedBytes: bigint('used_bytes', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueUserWeek: uniqueIndex('idx_bandwidth_user_week').on(table.userId, table.weekKey),
}))
