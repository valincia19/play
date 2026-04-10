import { adminAuditService } from './audit.service'
import { adminBillingService } from './billing.service'
import { adminMonitorService } from './monitor.service'
import { adminUserService } from './users.service'

class AdminServiceFacade {
  logAudit = adminAuditService.logAudit.bind(adminAuditService)
  getAuditLogs = adminAuditService.getAuditLogs.bind(adminAuditService)
  getAllUsers = adminUserService.getAllUsers.bind(adminUserService)
  updateUser = adminUserService.updateUser.bind(adminUserService)
  deleteUser = adminUserService.deleteUser.bind(adminUserService)
  getAllPlans = adminBillingService.getAllPlans.bind(adminBillingService)
  getAllTransactions = adminBillingService.getAllTransactions.bind(adminBillingService)
  givePlan = adminBillingService.givePlan.bind(adminBillingService)
  getStats = adminMonitorService.getStats.bind(adminMonitorService)
  getWorkerMonitor = adminMonitorService.getWorkerMonitor.bind(adminMonitorService)
  cleanupOrphanedS3Data = adminMonitorService.cleanupOrphanedS3Data.bind(adminMonitorService)
}

export const adminService = new AdminServiceFacade()
