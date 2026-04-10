import { Elysia } from 'elysia'
import { adminMonitorRoutes } from './monitor.routes'
import { adminUserRoutes } from './users.routes'
import { adminBillingRoutes } from './billing.routes'
import { adminStorageRoutes } from './storage.routes'
import { adminBlogRoutes } from './blog.routes'
import { adminDomainRoutes } from './domains.routes'

export const adminRoutes = new Elysia({ prefix: '/admin' })
  // Admin endpoints must NEVER be cached — enforce fresh data for every request
  .onAfterHandle(({ set }) => {
    set.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    set.headers['Pragma'] = 'no-cache'
  })
  .use(adminMonitorRoutes)
  .use(adminUserRoutes)
  .use(adminBillingRoutes)
  .use(adminStorageRoutes)
  .use(adminBlogRoutes)
  .use(adminDomainRoutes)
