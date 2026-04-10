import { Elysia } from 'elysia'
import { adminService } from './service'
import { success } from '../../utils/response'

export const adminMonitorRoutes = new Elysia()
  .get('/stats', async () => {
    const stats = await adminService.getStats()
    return success(stats)
  })
  .get('/monitor/worker', async () => {
    const snapshot = await adminService.getWorkerMonitor()
    return success(snapshot)
  })
  .post('/monitor/cleanup-storage', async () => {
    const result = await adminService.cleanupOrphanedS3Data()
    return success(result)
  })
  .get('/audit-logs', async ({ query }) => {
    const limit = parseInt(query.limit as string || '50')
    const offset = parseInt(query.offset as string || '0')

    const filters = {
      adminId: query.adminId as string | undefined,
      action: query.action as string | undefined,
      targetType: query.targetType as string | undefined,
      targetId: query.targetId as string | undefined,
    }

    const logs = await adminService.getAuditLogs(filters, limit, offset)
    return success(logs)
  })
