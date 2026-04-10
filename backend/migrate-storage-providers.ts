/**
 * Seed default storage providers (Cloudflare R2 + AWS S3).
 * Run once: bunx tsx migrate-storage-providers.ts
 */
import { db, storageProviders } from './src/schema'

async function seed() {
  console.log('🔧 Seeding default storage providers...')

  const existing = await db.select().from(storageProviders)
  if (existing.length > 0) {
    console.log(`⚠️  ${existing.length} provider(s) already exist. Skipping seed.`)
    process.exit(0)
  }

  await db.insert(storageProviders).values([
    { type: 'r2', name: 'Cloudflare R2', isActive: true },
    { type: 's3', name: 'AWS S3', isActive: true },
  ])

  console.log('✅ Seeded: Cloudflare R2, AWS S3')
  process.exit(0)
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
