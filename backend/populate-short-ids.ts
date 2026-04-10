import { db, videos, folders } from './src/schema'
import { generateShortId } from './src/utils/short-id'
import { eq, isNull } from 'drizzle-orm'

async function main() {
  const vids = await db.select().from(videos).where(isNull(videos.shortId))
  console.log(`Populating ${vids.length} videos...`)
  for (const v of vids) {
    await db.update(videos).set({ shortId: generateShortId(8) }).where(eq(videos.id, v.id))
  }

  const flds = await db.select().from(folders).where(isNull(folders.shortId))
  console.log(`Populating ${flds.length} folders...`)
  for (const f of flds) {
    await db.update(folders).set({ shortId: generateShortId(8) }).where(eq(folders.id, f.id))
  }

  console.log('Done populating shortIds.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
