import { createHash, createHmac } from 'crypto'
import { logger } from './logger'

const STREAM_SECRET = process.env.STREAM_SECRET || 'vplay_secure_stream_key_2024'

/**
 * Generate a signed token for an HLS segment or playlist.
 * @param videoId Unique ID of the video
 * @param expiry Timestamp when the token expires (seconds from epoch)
 * @param context Optional identifier (userId or slugId) to bind the token to a specific actor
 * @returns HMAC signature
 */
export function generateStreamSignature(videoId: string, expiry: number, context?: string): string {
  const data = `${videoId}:${expiry}:${context ?? 'anonymous'}`
  return createHmac('sha256', STREAM_SECRET).update(data).digest('hex')
}

/**
 * Validate a stream token.
 * @param videoId Video ID
 * @param expiry Expiry timestamp
 * @param signature Signature to verify
 * @param context Optional identifier to verify against
 * @returns boolean
 */
export function verifyStreamSignature(videoId: string, expiry: number, signature: string, context?: string): boolean {
  // 1. Check expiration
  const now = Math.floor(Date.now() / 1000)
  if (now > expiry) {
    logger.warn({ event: 'stream_signature_expired', videoId, expiry, now })
    return false
  }

  // 2. Re-calculate and compare
  const expected = generateStreamSignature(videoId, expiry, context)
  return expected === signature
}

/**
 * Generate a signed token specifically for public anonymous shares via a Slug ID.
 * @param videoId Unique ID of the video
 * @param slugId Public share slug identifier
 * @param expiry Timestamp when the token expires (seconds from epoch)
 * @returns HMAC signature
 */
export function generatePublicStreamSignature(videoId: string, slugId: string, expiry: number): string {
  return generateStreamSignature(videoId, expiry, slugId)
}

/**
 * Rewrite m3u8 playlist to use signed URLs for segments or sub-playlists.
 * Supports Master playlists (links to .m3u8) and Media playlists (links to .ts).
 */
export function signPlaylist(m3u8Content: string, videoId: string, baseUrl: string, tokenParams: string): string {
  // Regex to find both .m3u8 sub-playlists and .ts segments
  // This handles Master ABR playlists and individual rendition playlists
  return m3u8Content.replace(/([^\s]+\.(m3u8|ts))/g, (match) => {
    // If it's already an absolute URL, leave it (rare in local HLS)
    if (match.startsWith('http')) return match

    // For Master playlists, match will be like '360p/playlist.m3u8'
    // For Media playlists, match will be like 'seg-1.ts'
    return `${baseUrl}/${match}?${tokenParams}`
  })
}
