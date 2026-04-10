import { error, errorCodes } from '../../utils/response'
import { authService } from './service'
import { logger } from '../../utils/logger'

export const resolveAuthenticatedContext = async ({ request, status }: { request: Request, status: any }) => {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    logger.debug({ event: 'auth_rejected', reason: 'missing_token', url: request.url })
    return { _authFail: status(401, error(errorCodes.INVALID_TOKEN, 'Authorization required')) }
  }

  const token = authHeader.slice(7)
  const payload = await authService.verifyJwtToken(token)
  if (!payload) {
    logger.warn({ event: 'auth_rejected', reason: 'invalid_jwt', url: request.url })
    return { _authFail: status(401, error(errorCodes.INVALID_TOKEN, 'Authorization required')) }
  }

  return { userId: payload.userId, authUser: payload }
}

export const enforceAuthenticatedContext = ({ _authFail }: { _authFail?: unknown }) => {
  if (_authFail) return _authFail
}

export const resolveAdminContext = async ({ userId, status }: { userId: string, status: any }) => {
  const user = await authService.getUserById(userId)
  if (!user || user.role !== 'admin') {
    logger.warn({ event: 'admin_rejected', userId, role: user?.role ?? 'not_found' })
    return { _adminContextFail: status(403, error(errorCodes.INTERNAL_ERROR, 'Forbidden: Admin access required')) }
  }

  return { adminUser: user }
}

export const enforceAdminContext = ({ _adminContextFail }: { _adminContextFail?: unknown }) => {
  if (_adminContextFail) return _adminContextFail
}

export const resolveAdminRequestContext = async ({ request, status }: { request: Request, status: any }) => {
  const authContext = await resolveAuthenticatedContext({ request, status })
  if ('_authFail' in authContext) {
    return authContext
  }

  const adminContext = await resolveAdminContext({ userId: authContext.userId, status })
  if ('_adminContextFail' in adminContext) {
    return adminContext
  }

  return {
    userId: authContext.userId,
    authUser: authContext.authUser,
    adminUser: adminContext.adminUser,
  }
}

export const enforceAdminRequestContext = ({ _authFail, _adminContextFail }: { _authFail?: unknown, _adminContextFail?: unknown }) => {
  if (_authFail) return _authFail
  if (_adminContextFail) return _adminContextFail
}

