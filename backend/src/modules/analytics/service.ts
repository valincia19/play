import { db } from '../../schema/db'
import { trackingEvents, videos } from '../../schema'
import { eq, and, sql, gte, lte, desc, count, sum } from 'drizzle-orm'

export const analyticsService = {
  async getOverview(userId: string, from?: string, to?: string) {
    const hasDateFilter = !!from || !!to;
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (hasDateFilter) {
      startDate = from ? new Date(from) : new Date('2000-01-01');
      endDate = to ? new Date(to) : new Date();
      if (to) endDate.setUTCHours(23, 59, 59, 999);
    }

    const dateCondition = hasDateFilter 
      ? and(gte(trackingEvents.createdAt, startDate!), lte(trackingEvents.createdAt, endDate!))
      : undefined;

    // 1. Total Metrics (Always all-time state)
    const videoStats = await db.select({
      totalVideos: count(),
      totalStorage: sum(videos.fileSizeBytes)
    }).from(videos).where(eq(videos.userId, userId))

    const adStats = await db.select({
      totalAds: count()
    }).from(trackingEvents)
      .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
      .where(and(
        eq(videos.userId, userId),
        eq(trackingEvents.eventType, 'ad_impression'),
        dateCondition
      ))

    const uniqueViewers = await db.select({
      count: sql<number>`count(distinct ${trackingEvents.viewerFingerprint})`
    }).from(trackingEvents)
      .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
      .where(and(
        eq(videos.userId, userId),
        eq(trackingEvents.eventType, 'view'),
        dateCondition
      ))

    // Views & Bandwidth
    let finalTotalViews = 0;
    let finalTotalBandwidth = 0;

    if (hasDateFilter) {
      const viewStats = await db.select({
        totalViews: count(),
        totalBandwidth: sql<number>`COALESCE(SUM(${videos.fileSizeBytes} * 0.7), 0)`
      }).from(trackingEvents)
        .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
        .where(and(
          eq(videos.userId, userId),
          eq(trackingEvents.eventType, 'view'),
          dateCondition
        ))
      
      finalTotalViews = Number(viewStats[0]?.totalViews || 0);
      finalTotalBandwidth = Number(viewStats[0]?.totalBandwidth || 0);
    } else {
      const allTimeStats = await db.select({
        totalViews: sum(videos.views),
        totalBandwidth: sql<number>`COALESCE(SUM(${videos.views}::bigint * ${videos.fileSizeBytes} * 0.7), 0)`
      }).from(videos).where(eq(videos.userId, userId))
      
      finalTotalViews = Number(allTimeStats[0]?.totalViews || 0);
      finalTotalBandwidth = Number(allTimeStats[0]?.totalBandwidth || 0);
    }

    return {
      totalVideos: Number(videoStats[0]?.totalVideos || 0),
      totalViews: finalTotalViews,
      totalStorage: Number(videoStats[0]?.totalStorage || 0),
      totalAdImpressions: Number(adStats[0]?.totalAds || 0),
      totalUniqueSessions: Number(uniqueViewers[0]?.count || 0),
      totalBandwidth: finalTotalBandwidth
    }
  },

  async getViewsAnalytics(userId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const endDate = to ? new Date(to) : new Date()
    endDate.setUTCHours(23, 59, 59, 999)

    // Demographics queries
    const baseWhere = and(
      eq(videos.userId, userId),
      eq(trackingEvents.eventType, 'view'),
      gte(trackingEvents.createdAt, startDate),
      lte(trackingEvents.createdAt, endDate)
    )

    const dailyViews = await db.select({
      date: sql<string>`DATE(${trackingEvents.createdAt})`,
      views: count(),
      uniques: sql<number>`count(distinct ${trackingEvents.viewerFingerprint})`
    }).from(trackingEvents).innerJoin(videos, eq(trackingEvents.videoId, videos.id))
      .where(baseWhere).groupBy(sql`DATE(${trackingEvents.createdAt})`).orderBy(sql`DATE(${trackingEvents.createdAt})`)

    const devices = await db.select({ device: sql<string>`${trackingEvents.metadata}->>'device'`, count: count() })
      .from(trackingEvents).innerJoin(videos, eq(trackingEvents.videoId, videos.id)).where(baseWhere)
      .groupBy(sql`${trackingEvents.metadata}->>'device'`)

    const browsers = await db.select({ browser: sql<string>`${trackingEvents.metadata}->>'browser'`, count: count() })
      .from(trackingEvents).innerJoin(videos, eq(trackingEvents.videoId, videos.id)).where(baseWhere)
      .groupBy(sql`${trackingEvents.metadata}->>'browser'`)

    const countries = await db.select({ country: sql<string>`${trackingEvents.metadata}->>'country'`, count: count() })
      .from(trackingEvents).innerJoin(videos, eq(trackingEvents.videoId, videos.id)).where(baseWhere)
      .groupBy(sql`${trackingEvents.metadata}->>'country'`)

    // Retention metrics based on watch_progress
    const retentionData = await db.select({
      avgPercent: sql<number>`AVG(CAST(${trackingEvents.metadata}->>'percentage' AS numeric))`,
      avgDuration: sql<number>`AVG(CAST(${trackingEvents.metadata}->>'duration' AS numeric) * CAST(${trackingEvents.metadata}->>'percentage' AS numeric) / 100)`
    }).from(trackingEvents).innerJoin(videos, eq(trackingEvents.videoId, videos.id))
      .where(and(
        eq(videos.userId, userId),
        eq(trackingEvents.eventType, 'watch_progress'),
        gte(trackingEvents.createdAt, startDate),
        lte(trackingEvents.createdAt, endDate)
      ))

    return {
      daily: dailyViews,
      devices,
      browsers,
      countries,
      retention: {
        completionRate: Number(retentionData[0]?.avgPercent || 0),
        avgWatchDuration: Number(retentionData[0]?.avgDuration || 0)
      }
    }
  },

  async getAdsAnalytics(userId: string, from?: string, to?: string) {
    const startDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const endDate = to ? new Date(to) : new Date()
    endDate.setUTCHours(23, 59, 59, 999)

    const adImpressions = await db.select({
      date: sql<string>`DATE(${trackingEvents.createdAt})`,
      impressions: count()
    })
    .from(trackingEvents)
    .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
    .where(and(
      eq(videos.userId, userId),
      eq(trackingEvents.eventType, 'ad_impression'),
      gte(trackingEvents.createdAt, startDate),
      lte(trackingEvents.createdAt, endDate)
    ))
    .groupBy(sql`DATE(${trackingEvents.createdAt})`)
    .orderBy(sql`DATE(${trackingEvents.createdAt})`)

    // Provider Breakdown — queries JSONB properly (metadata is now stored as real JSON object)
    const providerBreakdown = await db.select({
      provider: sql<string>`${trackingEvents.metadata}->>'provider'`,
      count: count()
    })
    .from(trackingEvents)
    .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
    .where(and(
      eq(videos.userId, userId),
      eq(trackingEvents.eventType, 'ad_impression'),
      gte(trackingEvents.createdAt, startDate),
      lte(trackingEvents.createdAt, endDate)
    ))
    .groupBy(sql`${trackingEvents.metadata}->>'provider'`)

    const typeBreakdown = await db.select({
      type: sql<string>`${trackingEvents.metadata}->>'type'`,
      count: count()
    })
    .from(trackingEvents)
    .innerJoin(videos, eq(trackingEvents.videoId, videos.id))
    .where(and(
      eq(videos.userId, userId),
      eq(trackingEvents.eventType, 'ad_impression'),
      gte(trackingEvents.createdAt, startDate),
      lte(trackingEvents.createdAt, endDate)
    ))
    .groupBy(sql`${trackingEvents.metadata}->>'type'`)

    return {
      daily: adImpressions,
      providers: providerBreakdown,
      types: typeBreakdown
    }
  },

  async getTopVideos(userId: string, from?: string, to?: string, limit: number = 10) {
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    
    if (from || to) {
      startDate = from ? new Date(from) : new Date('2000-01-01');
      endDate = to ? new Date(to) : new Date();
      if (to) endDate.setUTCHours(23, 59, 59, 999);
    }

    const dateCondition = (startDate && endDate) 
      ? and(gte(trackingEvents.createdAt, startDate), lte(trackingEvents.createdAt, endDate))
      : undefined;

    return await db.select({
      id: videos.id,
      title: videos.title,
      views: sql<number>`CAST(count(${trackingEvents.id}) AS INT)`,
      fileSizeBytes: videos.fileSizeBytes,
      createdAt: videos.createdAt
    })
    .from(videos)
    .leftJoin(trackingEvents, and(
      eq(trackingEvents.videoId, videos.id),
      eq(trackingEvents.eventType, 'view'),
      dateCondition
    ))
    .where(eq(videos.userId, userId))
    .groupBy(videos.id)
    .orderBy(desc(sql`count(${trackingEvents.id})`))
    .limit(limit)
  }
}
