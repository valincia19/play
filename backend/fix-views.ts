import { db } from './src/schema/db';
import { sql } from 'drizzle-orm';

async function fixViews() {
  await db.execute(sql`
    UPDATE videos 
    SET views = COALESCE((
      SELECT CAST(COUNT(*) AS INT) 
      FROM tracking_events 
      WHERE tracking_events.video_id = videos.id 
      AND tracking_events.event_type = 'view'
    ), 0)
  `);
  console.log("Videos table views sync completed.");
  process.exit(0);
}

fixViews();
