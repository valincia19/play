import { db, users, plans, bandwidthUsage } from '../schema'
import { eq, sql } from 'drizzle-orm'
import { MB } from './constants'

/**
 * Get ISO week key: "2026-W15"
 */
function getWeekKey(): string {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1
  const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay()) / 7)
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

/**
 * Get start of current week (Monday 00:00)
 */
function getWeekStart(): Date {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * Track bytes served for a user — upsert into PostgreSQL.
 */
export async function trackBandwidth(userId: string, bytes: number): Promise<void> {
  if (bytes <= 0) return
  const weekKey = getWeekKey()

  // Atomic upsert: insert or increment
  await db.insert(bandwidthUsage)
    .values({ id: crypto.randomUUID(), userId, weekKey, usedBytes: bytes })
    .onConflictDoUpdate({
      target: [bandwidthUsage.userId, bandwidthUsage.weekKey],
      set: {
        usedBytes: sql`${bandwidthUsage.usedBytes} + ${bytes}`,
        updatedAt: new Date(),
      },
    })
}

/**
 * Get user's plan bandwidth limit in bytes.
 * Returns -1 for unlimited.
 */
async function getPlanBandwidthLimit(userId: string): Promise<number> {
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1)
  const planId = (user?.plan || 'free').toLowerCase()

  const [plan] = await db.select({ maxBandwidth: plans.maxBandwidth }).from(plans).where(eq(plans.id, planId)).limit(1)
  const maxMB = plan?.maxBandwidth ?? 5000

  if (maxMB === -1) return -1
  return maxMB * MB
}

export interface BandwidthUsage {
  usedBytes: number
  maxBytes: number
  usedMB: number
  maxMB: number
  weekStart: string
  weekEnd: string
  percent: number
  isUnlimited: boolean
}

/**
 * Get current week's bandwidth usage for a user.
 */
export async function getBandwidthUsage(userId: string): Promise<BandwidthUsage> {
  const maxBytes = await getPlanBandwidthLimit(userId)
  const isUnlimited = maxBytes === -1

  const weekKey = getWeekKey()
  const [row] = await db.select({ usedBytes: bandwidthUsage.usedBytes })
    .from(bandwidthUsage)
    .where(sql`${bandwidthUsage.userId} = ${userId} AND ${bandwidthUsage.weekKey} = ${weekKey}`)
    .limit(1)

  const usedBytes = Number(row?.usedBytes ?? 0)

  const weekStart = getWeekStart()
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  return {
    usedBytes,
    maxBytes: isUnlimited ? -1 : maxBytes,
    usedMB: Math.round(usedBytes / MB),
    maxMB: isUnlimited ? -1 : Math.round(maxBytes / MB),
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    percent: isUnlimited ? 0 : Math.min(Math.round((usedBytes / maxBytes) * 100), 100),
    isUnlimited,
  }
}

/**
 * Check if a user can serve `contentLength` more bytes this week.
 */
export async function checkBandwidthQuota(userId: string, contentLength: number): Promise<boolean> {
  const usage = await getBandwidthUsage(userId)
  if (usage.isUnlimited) return true
  return (usage.usedBytes + contentLength) <= usage.maxBytes
}
