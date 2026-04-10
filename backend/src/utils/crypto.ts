import bcrypt from 'bcryptjs'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { logger } from './logger'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex')
}

// ─── AES-256-GCM Symmetric Encryption (Versioned) ───────────────────
// Supports key rotation via prefixes: enc:v1:...
// Keys are loaded from STORAGE_ENCRYPTION_KEY (default v1)
// Additional keys: STORAGE_ENCRYPTION_KEY_V2, etc.

const KEYS: Record<string, string> = {
  v1: process.env.STORAGE_ENCRYPTION_KEY || '',
  v2: process.env.STORAGE_ENCRYPTION_KEY_V2 || '',
}

const LATEST_VERSION = 'v1' // Update this to 'v2' when rotating

function getKey(version: string): Buffer {
  const keyHex = KEYS[version]
  if (!keyHex || keyHex.length !== 64) {
    logger.fatal({ event: 'encryption_key_invalid', version })
    process.exit(1)
  }
  return Buffer.from(keyHex, 'hex')
}

/**
 * Detects if a string is already encrypted using our format.
 */
export function isEncrypted(val: string): boolean {
  return typeof val === 'string' && val.startsWith('enc:v')
}

/**
 * Encrypt a plaintext string using AES-256-GCM (Latest Version).
 * Format: `enc:v{version}:{iv}:{authTag}:{ciphertext}`
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (isEncrypted(plaintext)) return plaintext // Prevent double encrypt

  const version = LATEST_VERSION
  const key = getKey(version)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  
  return `enc:${version}:${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypt a ciphertext created by encryptSecret.
 * Automatically detects version and uses the correct key.
 */
export function decryptSecret(encrypted: string): string {
  if (!encrypted) return ''
  
  try {
    // Support legacy format (iv:authTag:ciphertext) for migration if needed
    // or strictly enforce prefix. User requested "Add Prefix" + "Reject invalid format".
    if (!isEncrypted(encrypted)) {
       // Check for legacy migration format if we still have it
       if (encrypted.split(':').length === 3) {
         // This is a legacy v1 without prefix. 
         // We'll treat it as v1 but log a warning.
         return decryptLegacyV1(encrypted)
       }
       throw new Error('Invalid encryption prefix')
    }

    const [prefix, version, ivHex, authTagHex, ciphertext] = encrypted.split(':')
    if (prefix !== 'enc' || !version || !ivHex || !authTagHex || !ciphertext) {
      throw new Error('Malformed encrypted payload')
    }

    const key = getKey(version)
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err: any) {
    logger.error({ event: 'decryption_failed', error: err.message, stack: err.stack })
    throw new Error(`DECRYPT_FAILED: ${err.message}`)
  }
}

/** Internal helper for legacy v1 without prefix */
function decryptLegacyV1(encrypted: string): string {
  const key = getKey('v1')
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid legacy format')
  
  const [ivHex, authTagHex, ciphertext] = parts
  
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex!, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex!, 'hex'))
  
  let decrypted = decipher.update(ciphertext!, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
