import { db } from '../src/schema/db'
import { videos } from '../src/schema/video.schema'
import { eq, like } from 'drizzle-orm'

async function fix() {
  const res = await db.update(videos)
    .set({ status: 'ready', errorMessage: null })
    .where(eq(videos.id, 'afa3fa56-a054-42de-9cec-72be85d15fe3'))
    .returning()
  
  console.log('Fixed:', res.length, 'videos')
  process.exit(0)
}

fix()
