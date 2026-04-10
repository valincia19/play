import { Elysia, t } from 'elysia'
import { adminService } from './service'
import { storageService } from '../storage'
import { success } from '../../utils/response'
import { db } from '../../schema'
import { requireAdminUser } from './context'

export const adminStorageRoutes = new Elysia()
  .get('/storage/providers', async () => {
    return success(await storageService.getProviders())
  })
  .patch('/storage/providers/:id/toggle', async ({ params, body }) => {
    return success(await storageService.setProviderActive(params.id, (body as any).isActive))
  }, {
    body: t.Object({
      isActive: t.Boolean(),
    })
  })
  .get('/storage/buckets', async () => {
    return success(await storageService.getBuckets())
  })
  .post('/storage/buckets', async ({ request, status, body }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const result = await storageService.createBucket(body)
    await adminService.logAudit(db, auth.adminUser.id, 'ADD_BUCKET', 'bucket', result?.id || 'unknown', body)
    return success(result)
  }, {
    body: t.Object({
      providerId: t.String(),
      name: t.String(),
      region: t.Optional(t.String()),
      endpoint: t.Optional(t.String()),
      accessKey: t.String(),
      secretKey: t.String(),
      isDefault: t.Boolean(),
      maxStorageGB: t.Number(),
    })
  })
  .put('/storage/buckets/:id', async ({ request, status, params, body }) => {
    const auth = await requireAdminUser(request, status)
    if ('response' in auth) return auth.response

    const result = await storageService.updateBucket(params.id, body)
    await adminService.logAudit(db, auth.adminUser.id, 'UPDATE_BUCKET', 'bucket', params.id, body)
    return success(result)
  }, {
    body: t.Object({
      name: t.Optional(t.String()),
      region: t.Optional(t.String()),
      endpoint: t.Optional(t.String()),
      accessKey: t.Optional(t.String()),
      secretKey: t.Optional(t.String()),
      isActive: t.Optional(t.Boolean()),
      isDefault: t.Optional(t.Boolean()),
      maxStorageGB: t.Optional(t.Number()),
      usedStorageGB: t.Optional(t.Number()),
    })
  })
  .patch('/storage/buckets/:id/default', async ({ params }) => {
    return success(await storageService.setDefaultBucket(params.id))
  })
  .delete('/storage/buckets/:id', async ({ params }) => {
    return success(await storageService.deleteBucket(params.id))
  })
  .post('/storage/buckets/:id/test', async ({ params }) => {
    return success(await storageService.testBucketConnection(params.id))
  }, {
    detail: {
      description: 'Test bucket connection'
    }
  })
  .post('/storage/buckets/:id/fix-cors', async ({ params }) => {
    return success(await storageService.fixBucketCors(params.id))
  }, {
    detail: {
      description: 'Automatically fix CORS policy for direct uploads'
    }
  })
