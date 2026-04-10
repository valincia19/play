import { Elysia, t } from 'elysia'
import { authService } from './service'
import { success, error, errorCodes, httpStatusMap } from '../../utils/response'
import { logger } from '../../utils/logger'
import {
  checkRateLimit,
  REGISTER_LIMIT,
  LOGIN_LIMIT,
} from '../../middleware/rate-limit'

/**
 * Returns the appropriate HTTP status code for a given error response object.
 */
function getErrorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'error' in err) {
    const code = (err as any).error?.code
    return httpStatusMap[code] ?? 500
  }
  return 500
}

/**
 * Extracts the client IP from the Elysia request.
 * Supports X-Forwarded-For for reverse proxy setups (Docker, Nginx, etc.)
 */
function getClientIp(request: Request, server: any): string {
  // Check X-Forwarded-For first (reverse proxy / Docker)
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }

  // Bun server can resolve the IP from the request
  try {
    const addr = server?.requestIP?.(request)
    if (addr?.address) return addr.address
  } catch {
    // Fallback
  }

  return 'unknown'
}

export const authRoutes = new Elysia({ prefix: '/auth' })
  .post(
    '/register',
    async ({ body, status, request, server }) => {
      // Rate limit by IP
      const ip = getClientIp(request, server)
      const limit = await checkRateLimit(REGISTER_LIMIT, ip)
      if (!limit.allowed) {
        return status(429, error(
          'RATE_LIMIT_EXCEEDED',
          `Too many registration attempts. Please try again in ${Math.ceil(limit.resetIn / 60)} minutes.`
        ))
      }

      try {
        const result = await authService.register(body)
        return status(201, success(result))
      } catch (err) {
        if (err && typeof err === 'object' && 'success' in err && !err.success) {
          return status(getErrorStatus(err), err as any)
        }
        logger.error({ event: 'auth_register_error', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
        return status(500, error(errorCodes.INTERNAL_ERROR, 'An unexpected error occurred'))
      }
    },
    {
      body: t.Object({
        name: t.String(),
        email: t.String(),
        password: t.String(),
      }),
    }
  )
  .get(
    '/verify',
    async ({ query, status }) => {
      try {
        if (!query.token) {
          return status(400, error(errorCodes.INVALID_TOKEN, 'Verification token is required'))
        }
        const result = await authService.verify(query.token)
        return success(result)
      } catch (err) {
        if (err && typeof err === 'object' && 'success' in err && !err.success) {
          return status(getErrorStatus(err), err as any)
        }
        logger.error({ event: 'auth_verify_error', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
        return status(500, error(errorCodes.INTERNAL_ERROR, 'An unexpected error occurred'))
      }
    },
    {
      query: t.Object({
        token: t.String(),
      }),
    }
  )
  .post(
    '/login',
    async ({ body, status, request, server }) => {
      // Rate limit by IP
      const ip = getClientIp(request, server)
      const limit = await checkRateLimit(LOGIN_LIMIT, ip)
      if (!limit.allowed) {
        return status(429, error(
          'RATE_LIMIT_EXCEEDED',
          `Too many login attempts. Please try again in ${Math.ceil(limit.resetIn / 60)} minutes.`
        ))
      }

      try {
        const result = await authService.login(body)
        return success(result)
      } catch (err) {
        if (err && typeof err === 'object' && 'success' in err && !err.success) {
          return status(getErrorStatus(err), err as any)
        }
        logger.error({ event: 'auth_login_error', error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
        return status(500, error(errorCodes.INTERNAL_ERROR, 'An unexpected error occurred'))
      }
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )
  .get(
    '/me',
    async ({ request, status }) => {
      // Extract Bearer token from Authorization header
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Authorization token required'))
      }

      const token = authHeader.slice(7) // Remove "Bearer "
      const payload = await authService.verifyJwtToken(token)
      if (!payload) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Invalid or expired token'))
      }

      const user = await authService.getUserById(payload.userId)
      if (!user) {
        return status(404, error(errorCodes.USER_NOT_FOUND, 'User not found'))
      }

      return success(user)
    }
  )
  .patch(
    '/me',
    async ({ request, body, status }) => {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Authorization token required'))
      }

      const token = authHeader.slice(7)
      const payload = await authService.verifyJwtToken(token)
      if (!payload) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Invalid or expired token'))
      }

      try {
        const updatedUser = await authService.updateUser(payload.userId, body)
        if (!updatedUser) {
          return status(404, error(errorCodes.USER_NOT_FOUND, 'User not found'))
        }
        return success({ message: 'Profile updated successfully', user: updatedUser })
      } catch (err) {
        if (err && typeof err === 'object' && 'success' in err && !err.success) {
          return status(getErrorStatus(err), err as any)
        }
        return status(500, error(errorCodes.INTERNAL_ERROR, 'An unexpected error occurred'))
      }
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    '/me',
    async ({ request, status }) => {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Authorization token required'))
      }

      const token = authHeader.slice(7)
      const payload = await authService.verifyJwtToken(token)
      if (!payload) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Invalid or expired token'))
      }

      const deleted = await authService.deleteUser(payload.userId)
      if (!deleted) {
        return status(404, error(errorCodes.USER_NOT_FOUND, 'User not found'))
      }

      return success({ message: 'Account deleted successfully' })
    }
  )
  .get(
    '/users',
    async ({ request, status }) => {
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Authorization token required'))
      }

      const token = authHeader.slice(7)
      const payload = await authService.verifyJwtToken(token)
      if (!payload) {
        return status(401, error(errorCodes.INVALID_TOKEN, 'Invalid or expired token'))
      }

      const currentUser = await authService.getUserById(payload.userId)
      if (!currentUser || currentUser.role !== 'admin') {
        return status(403, error(errorCodes.INVALID_TOKEN, 'Forbidden: Admin access required'))
      }

      const allUsers = await authService.getAllUsers()
      return success(allUsers)
    }
  )
