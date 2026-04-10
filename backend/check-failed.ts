import { db, videos } from './src/schema'
import { eq } from 'drizzle-orm'

async function main() {
  const failed = await db.select({ 
    id: videos.id, 
    title: videos.title, 
    status: videos.status, 
    error: videos.errorMessage, 
    mode: videos.processingMode 
  })
  .from(videos)
  .where(eq(videos.status, 'error'))

  console.log('Failed videos:')
  for (const v of failed) {
    console.log(`  [${v.id}] ${v.title} | mode=${v.mode} | error=${v.error}`)
  }
  console.log(`\nTotal: ${failed.length}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
