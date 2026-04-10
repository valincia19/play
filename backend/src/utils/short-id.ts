import crypto from 'crypto'

/**
 * Generates a secure, URL-friendly random string of a given length.
 * Uses Base62 characters (A-Z, a-z, 0-9).
 */
export function generateShortId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  const bytes = crypto.randomBytes(length)
  for (let i = 0; i < length; i++) {
    const byte = bytes[i]
    if (byte === undefined) continue // Should not happen with Buffer
    result += chars.charAt(byte % chars.length)
  }
  return result
}
