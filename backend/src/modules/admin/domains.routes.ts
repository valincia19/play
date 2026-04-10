import { Elysia, t } from 'elysia'
import { adminDomainService } from './domains.service'
import { success, error } from '../../utils/response'

export const adminDomainRoutes = new Elysia()
  .get('/domains', async () => {
    const domains = await adminDomainService.getAll()
    return success(domains)
  })

  .post('/domains', async ({ body }) => {
    try {
      const domain = await adminDomainService.create(body)
      return success(domain)
    } catch (e: any) {
      return error('DOMAIN_CREATE_FAILED', e.message || 'Failed to create domain')
    }
  }, {
    body: t.Object({
      domain: t.String({ minLength: 1 }),
      isActive: t.Optional(t.Boolean()),
    })
  })

  .put('/domains/:id', async ({ params, body }) => {
    try {
      const domain = await adminDomainService.update(params.id, body)
      return success(domain)
    } catch (e: any) {
      return error('DOMAIN_UPDATE_FAILED', e.message || 'Failed to update domain')
    }
  }, {
    body: t.Object({
      domain: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean()),
    })
  })

  .patch('/domains/:id/default', async ({ params }) => {
    try {
      const domain = await adminDomainService.setDefault(params.id)
      return success(domain)
    } catch (e: any) {
      return error('DOMAIN_DEFAULT_FAILED', e.message || 'Failed to set default domain')
    }
  })

  .patch('/domains/:id/verify', async ({ params }) => {
    try {
      const domain = await adminDomainService.verify(params.id)
      return success(domain)
    } catch (e: any) {
      return error('DOMAIN_VERIFY_FAILED', e.message || 'Failed to verify domain')
    }
  })

  .delete('/domains/:id', async ({ params }) => {
    try {
      const deleted = await adminDomainService.delete(params.id)
      return success(deleted)
    } catch (e: any) {
      return error('DOMAIN_DELETE_FAILED', e.message || 'Failed to delete domain')
    }
  })
