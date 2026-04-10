import { db } from './src/schema/db'
import { plans } from './src/schema/plan.schema'
import { eq } from 'drizzle-orm'

async function seedPlans() {
  const defaultPlans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      maxVideos: 100,
      maxStorage: 2000, // 2 GB
      maxBandwidth: 5000, // 5 GB
      durationDays: 30, // meaningless for free really
      position: 1,
      capabilities: {
        ads: false,
        redirect: false,
        analyticsAdvanced: false
      },
      features: [
        { label: "Up to 100 Video Uploads", highlight: true },
        { label: "Standard Definition (720p)", highlight: false },
        { label: "Basic Public Links", highlight: false },
        { label: "Limited Bandwidth (5GB/mo)", highlight: false },
        { label: "2GB Storage Space", highlight: false },
        { label: "No Monetization", highlight: false },
      ],
      isActive: true
    },
    {
      id: 'creator',
      name: 'Creator',
      price: 59000,
      maxVideos: -1, // Unlimited
      maxStorage: 1000000, // 1 TB
      maxBandwidth: 100000, // 100 GB
      durationDays: 30,
      position: 2,
      capabilities: {
        ads: true,
        redirect: false,
        analyticsAdvanced: false
      },
      features: [
        { label: "Unlimited Video Uploads", highlight: true },
        { label: "High Definition (1080p)", highlight: true },
        { label: "Private Sharing System", highlight: false },
        { label: "Basic Ads Monetization", highlight: true },
        { label: "Basic Analytics", highlight: false },
        { label: "Standard Bandwidth (100GB/mo)", highlight: false },
        { label: "1TB Storage Space", highlight: false },
      ],
      isActive: true
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 129000,
      maxVideos: -1,
      maxStorage: 10000000, // 10 TB
      maxBandwidth: -1, // Unlimited
      durationDays: 30,
      position: 3,
      capabilities: {
        ads: true,
        redirect: true,
        analyticsAdvanced: true
      },
      features: [
        { label: "Everything in Creator", highlight: true },
        { label: "4K Ultra HD Streaming", highlight: true },
        { label: "Advanced Ads System", highlight: true },
        { label: "Custom Redirect Links", highlight: true },
        { label: "Advanced Revenue Analytics", highlight: true },
        { label: "Unlimited Bandwidth", highlight: false },
        { label: "10TB Storage Space", highlight: false },
      ],
      isActive: true
    }
  ]

  for (const plan of defaultPlans) {
    const existing = await db.query.plans.findFirst({ where: eq(plans.id, plan.id) })
    if (existing) {
      await db.update(plans).set(plan).where(eq(plans.id, plan.id))
      console.log(`Updated plan: ${plan.name}`)
    } else {
      await db.insert(plans).values(plan)
      console.log(`Inserted plan: ${plan.name}`)
    }
  }

  console.log('Seed complete!')
  
  try {
    const { redisManager } = require('./src/utils/redis');
    const redis = await redisManager.getClient();
    await redis.del('vercelplay:plans:active');
    console.log('Cache invalidated!');
  } catch (e) {
    console.error('Failed to clear cache', e)
  }
  
  process.exit(0)
}

seedPlans().catch((err) => {
  console.error(err);
  process.exit(1);
})
