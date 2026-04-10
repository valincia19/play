import { Elysia } from 'elysia'
import { db } from '../../schema'
import { domains } from '../../schema/domain.schema'
import { eq } from 'drizzle-orm'
import { success } from '../../utils/response'

/**
 * Public domain route — returns the default domain for share links.
 * Available to any authenticated user (not admin-only).
 */
export const domainRoutes = new Elysia({ prefix: '/domains' })
  .get('/active', async () => {
    const activeDomains = await db.select()
      .from(domains)
      .where(eq(domains.isActive, true))

    return success(activeDomains)
  })
