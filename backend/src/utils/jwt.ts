import jwt from 'jsonwebtoken'
import { env } from '../config/env'

// Lazy access — avoids 'Config not loaded' when Bun --watch re-evaluates modules
function getJwtSecret() { return env.jwtSecret }

const JWT_EXPIRES_IN = '7d'
const REFRESH_TOKEN_EXPIRES_IN = '30d'

export interface JwtPayload {
  userId: string
  email: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export function generateTokens(payload: JwtPayload): TokenPair {
  const accessToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256',
  })

  const refreshToken = jwt.sign(payload, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    algorithm: 'HS256',
  })

  return { accessToken, refreshToken }
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as unknown as JwtPayload
    return decoded
  } catch {
    return null
  }
}

