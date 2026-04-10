import { Elysia, t } from 'elysia'
import { adminService } from './service'
import { success, error } from '../../utils/response'
import { requireAdminUser } from './context'
import { logger } from '../../utils/logger'

export const adminUserRoutes = new Elysia()
  .get('/users', async ({ request, status }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const users = await adminService.getAllUsers()
    return success(users)
  })
  .put('/users/:id', async ({ request, status, params, body }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    logger.info({ body, userId: params.id, adminId: auth.adminUser.id }, '[AdminRoute] PUT /users/:id body received')

    try {
      const result = await adminService.updateUser(auth.adminUser.id, params.id, body as any)
      return success(result)
    } catch (err: any) {
      logger.error({ err: err.message, code: err.code, userId: params.id }, '[AdminRoute] updateUser failed')

      if (err.code === 'EMAIL_EXISTS') {
        status(409)
        return error('EMAIL_EXISTS', err.message)
      }
      if (err.code === 'INVALID_INPUT') {
        status(400)
        return error('INVALID_INPUT', err.message)
      }

      status(500)
      return error('UPDATE_FAILED', 'Failed to update user')
    }
  }, {
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2, maxLength: 120 })),
      email: t.Optional(t.String({ format: 'email' })),
      password: t.Optional(t.String({ minLength: 8, maxLength: 128 })),
      role: t.Optional(t.Union([t.Literal('user'), t.Literal('admin')])),
      status: t.Optional(t.Union([t.Literal('active'), t.Literal('suspended')])),
      plan: t.Optional(t.String()),
      planStartDate: t.Optional(t.String()),
      planEndDate: t.Optional(t.String()),
    })
  })
  .delete('/users/:id', async ({ request, status, params }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const result = await adminService.deleteUser(auth.adminUser.id, params.id)
    return success(result)
  })
