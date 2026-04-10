import { db } from '../../schema'
import { domains } from '../../schema/domain.schema'
import { eq, desc } from 'drizzle-orm'
import { logger } from '../../utils/logger'

class AdminDomainService {
  /** List all domains ordered by creation date */
  async getAll() {
    return db.select().from(domains).orderBy(desc(domains.createdAt))
  }

  /** List only active + verified domains (for share link picker) */
  async getActiveDomains() {
    return db.select()
      .from(domains)
      .where(eq(domains.isActive, true))
      .orderBy(desc(domains.createdAt))
  }

  /** Get a single domain by ID */
  async getById(id: string) {
    const [domain] = await db.select().from(domains).where(eq(domains.id, id)).limit(1)
    return domain || null
  }

  /** Create a new custom domain */
  async create(data: { domain: string; isActive?: boolean }) {
    const normalized = data.domain.trim().toLowerCase()

    // Check if another domain already exists — if not, make this the default
    const existing = await db.select({ id: domains.id }).from(domains).limit(1)
    const isDefault = existing.length === 0

    const [domain] = await db.insert(domains).values({
      domain: normalized,
      isActive: data.isActive ?? true,
      isDefault,
      isVerified: false,
      sslStatus: 'pending',
    }).returning()

    if (!domain) throw new Error('Failed to create domain')
    logger.info({ event: 'domain_created', domainId: domain.id, domain: domain.domain })
    return domain
  }

  /** Update a domain's configuration */
  async update(id: string, data: { domain?: string; isActive?: boolean }) {
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    }

    if (data.domain !== undefined) {
      updateFields.domain = data.domain.trim().toLowerCase()
    }
    if (data.isActive !== undefined) {
      updateFields.isActive = data.isActive
    }

    const [domain] = await db.update(domains)
      .set(updateFields)
      .where(eq(domains.id, id))
      .returning()

    if (!domain) throw new Error('Domain not found or update failed')
    logger.info({ event: 'domain_updated', domainId: domain.id })
    return domain
  }

  /** Set a domain as the default delivery domain */
  async setDefault(id: string) {
    // Unset all defaults first
    await db.update(domains).set({ isDefault: false })
    // Set the new default
    const [domain] = await db.update(domains)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning()

    if (!domain) throw new Error('Domain not found')
    logger.info({ event: 'domain_set_default', domainId: domain.id, domain: domain.domain })
    return domain
  }

  /** Manually verify a domain (admin override) */
  async verify(id: string) {
    const [domain] = await db.update(domains)
      .set({ isVerified: true, sslStatus: 'active', updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning()

    if (!domain) throw new Error('Domain not found')
    logger.info({ event: 'domain_verified', domainId: domain.id, domain: domain.domain })
    return domain
  }

  /** Delete a domain */
  async delete(id: string) {
    // Prevent deleting the default domain
    const [existing] = await db.select({ isDefault: domains.isDefault }).from(domains).where(eq(domains.id, id)).limit(1)
    if (existing?.isDefault) {
      throw new Error('Cannot delete the default domain. Set another domain as default first.')
    }

    const [deleted] = await db.delete(domains).where(eq(domains.id, id)).returning({ id: domains.id })
    if (!deleted) throw new Error('Domain not found')
    logger.info({ event: 'domain_deleted', domainId: id })
    return deleted
  }
}

export const adminDomainService = new AdminDomainService()
