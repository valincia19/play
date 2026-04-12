import { db } from '../src/schema/db'
import { videos } from '../src/schema/video.schema'
import { desc } from 'drizzle-orm'

async function checkErrors() {
  try {
    const result = await db.select({
      id: videos.id,
      title: videos.title,
      status: videos.status,
      errorMessage: videos.errorMessage
    })
    .from(videos)
    .orderBy(desc(videos.createdAt))
    .limit(5)

    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(err)
  }
  process.exit(0)
}

checkErrors()
