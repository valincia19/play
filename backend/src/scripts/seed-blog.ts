import { db, blogPosts } from '../schema'

const SEED_POSTS = [
  {
    title: 'How to Integrate Monetag Direct Link',
    slug: 'how-to-integrate-monetag-direct-link',
    coverImageUrl: 'https://images.unsplash.com/photo-1550565118-3a14e8d0386f?auto=format&fit=crop&q=80&w=1200',
    excerpt: 'A step-by-step guide to generating a Monetag Direct Link and monetizing your video platform traffic effortlessly.',
    content: `## Complete Guide to Monetag Direct Link Integration

Below are the complete steps to acquire a Direct Link straight from your Monetag dashboard. 

### Step 1: Register as a Publisher

If you haven't yet, [register for a Monetag Publisher account here](https://monetag.com/?ref_id=zsAq). Once approved and logged in, proceed to your dashboard.

### Step 2: Navigate to Direct Links

On the sidebar navigation menu, look for the **Direct Link** section and click it to open your available links panel.

![Step 2 Direct Link Sidebar](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-120757.webp)

### Step 3: Add a New Direct Link

On the Direct Links page, click the button to **Add direct link** to generate a new monetization endpoint for your Vercelplay traffic.

![Step 3 Add Direct Link](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-120955.webp)

### Step 4: Copy & Paste Integration

Once the link is generated, copy the URL provided.

![Step 4 Copy Link](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-121149.webp)

Finally, go back to your **Creator Dashboard**, navigate to **Ads Toolkit**, select the **Monetag** provider, and paste the link into the configuration block. Save your changes!`,
    category: 'Tutorial',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-16'),
  },
  {
    title: 'How to Integrate Adsterra Smart Link',
    slug: 'how-to-integrate-adsterra-smart-link',
    coverImageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&q=80&w=1200',
    excerpt: 'A comprehensive step-by-step guide to generating a Smart Link from Adsterra and integrating it into your video platform for maximum monetization.',
    content: `## Complete Guide to Adsterra Smart Link Integration

Below are the complete steps to acquire a Smart Link straight from your Adsterra dashboard.

### Step 1: Register as a Publisher

If you haven't yet, [register for an Adsterra Publisher account here](https://beta.publishers.adsterra.com/referral/A9DYAWgdC1). Once approved and logged in, proceed to your dashboard.

### Step 2: Navigate to Your Dashboard

First, open your Adsterra panel and navigate to the dashboard from the side menu.

![Step 2 Dashboard](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-110956.webp)

### Step 3: Add a Smart Link

Look at the right side of your screen and click on the green button that says **Add Smart Link** to request a new endpoint.

![Step 3 Add Button](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-111106.webp)

### Step 4: Select Traffic Category

Choose the traffic category that best matches your audience. You can select either "Adult" or "Mainstream". Make sure this aligns with your video content to ensure optimal ad relevance.

![Step 4 Traffic Category](https://upld.zone.id/uploads/dhiqu4wiq/screenshot-2026-04-09-111157.webp)

### Step 5: Copy & Paste Integration

Once approved, copy the generated Smart Link URL. Go to your **Creator Dashboard**, navigate to **Ads Toolkit**, select the Adsterra provider, and paste the link into your configuration. Save your changes and you're good to go!`,
    category: 'Tutorial',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-15'),
  },
  {
    title: 'Maximizing Ad Revenue with VAST Pre-Roll & Popunder Combo',
    slug: 'maximizing-ad-revenue-vast-preroll-popunder',
    excerpt: 'Learn how to combine VAST pre-roll ads with Adsterra popunders to achieve the highest CPM without destroying your viewer experience.',
    content: `## Why Combine VAST Pre-Roll with Popunders?

Running a single ad format limits your revenue ceiling. By layering a short VAST pre-roll (5-15 seconds) before your video plays, paired with a one-time popunder that fires on user interaction, you can effectively double your eCPM while keeping bounce rates low.

### Step 1: Set Up Your VAST Tag

Navigate to **Dashboard → Ads → Ads Toolkit Setup** and select "Custom VAST Tag" as your provider. Paste your VAST XML endpoint URL. We recommend keeping pre-rolls under 15 seconds for optimal completion rates.

### Step 2: Add Adsterra Popunder

Switch to a second ad slot and select "Adsterra" as the provider with "Popunder" format. Paste your Adsterra publisher script. The popunder fires exactly once per session, so it won't annoy returning viewers.

### Step 3: Monitor Your eCPM

Use the Analytics dashboard to track impressions vs. revenue. A healthy setup should yield $3-8 eCPM for Tier-1 traffic (US/UK/EU).

> **Pro Tip:** Never stack more than 2 ad formats on a single video page. Viewer retention drops sharply after 2 interruptions.`,
    category: 'Monetization',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-14'),
  },
  {
    title: 'Adsterra vs Monetag: Which Ad Network Pays More in 2026?',
    slug: 'adsterra-vs-monetag-comparison-2026',
    excerpt: 'A head-to-head comparison of Adsterra and Monetag for video creators — covering CPM rates, payment terms, ad formats, and fill rates.',
    content: `## Adsterra vs Monetag: The Complete Breakdown for Publishers

Adsterra and Monetag (formerly PropellerAds) are two of the biggest names in alternative monetization for video and general publishers. Here is our data-driven breakdown of which network pays more and fits best in 2026.

### 1. Payout Minimums & Terms

When it comes to getting paid quickly, both have competitive terms, but slightly different thresholds depending on your withdrawal method.

- **Monetag:** Known for its phenomenal **Weekly Payouts** (every Thursday) with a minimum of just **$5** for PayPal, Skrill, WebMoney, and Payoneer. Wire transfers require $500.
- **Adsterra:** Operates on a **Net-15** schedule (payments are processed twice a month on the 1st/2nd and 16th/17th). The minimum payout is **$5** for WebMoney/Paxum, but **$100** for PayPal, $250 for Bitcoin, and $1,000 for Wire.

**Winner for Cashflow:** Monetag, thanks to its reliable Weekly Payouts and low $5 minimum for PayPal.

### 2. Available Ad Formats

- **Monetag:** Popunder (Onclick), Push Notifications, In-Page Push, Interstitials, Vignette Banners, and Smart Direct Links. Monetag is famous for its Anti-Adblock technology that recovers lost revenue.
- **Adsterra:** Popunder, Social Bar (highly converting in-page push alternative), Native Ads, Display Banners, and Direct Links.

**Winner for Formats:** Tie. Adsterra's Social Bar drives unprecedented engagement, but Monetag's Anti-Adblock scripts let you monetize traffic you’d otherwise lose.

### 3. CPM Rates & Fill Rates (Global Average)

While CPM varies heavily by traffic tier (Tier-1 like US/UK vs Tier-3 like IN/ID), we generally see consistent trends:

| Metric | Adsterra | Monetag |
|--------|----------|---------|
| Popunder (Tier 1 & 2) | ~$3.50 - $6.00 | ~$3.00 - $5.50 |
| In-Page / Social Bar | Extremely High (CPA driven) | Moderate-High |
| Direct/Smart Link | Strong (Great for Social traffic) | Exceptional (Multi-format wrap) |
| Global Fill Rate | Near 100% | 98%+ |

Adsterra tends to run slightly more aggressive CPA campaigns that result in massive CPM spikes if your traffic converts well. Monetag tends to offer a smoother, more predictable eCPM with slightly cleaner ad feeds.

### The Final Verdict

Don't guess—test. **Adsterra** usually wins for raw Popunder CPM and Social Bar conversions. **Monetag** excels if you need Weekly Payouts or specifically want to bypass Adblockers with their proprietary tech.

For Vercelplay creators, we recommend routing your primary web traffic through **Adsterra Popunders**, while using **Monetag's Direct Link** for your social media bios and external promotions.`,
    category: 'Monetization',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-10'),
  },
  {
    title: 'How to Set Up Your First Ad Campaign on Vercelplay',
    slug: 'setup-first-ad-campaign-vercelplay',
    excerpt: 'A step-by-step tutorial for new creators to configure their first ad integration using the Vercelplay Ads Toolkit.',
    content: `## Getting Started with Ads on Vercelplay

Monetizing your video content shouldn't be complicated. This guide walks you through setting up your first ad campaign in under 10 minutes.

### Prerequisites

1. A Vercelplay account with at least 1 uploaded video
2. An account with an ad provider (Adsterra, Monetag, or your own VAST endpoint)

### Step 1: Open the Ads Toolkit

Navigate to **Dashboard → Ads**. You'll see the Ads Toolkit Setup card.

### Step 2: Choose Your Provider

Select your ad network from the dropdown. If you're just starting out, we recommend **Adsterra** for its high fill rates and easy approval process.

### Step 3: Select Ad Format

Choose "Popunder" for the easiest setup — no code placement needed. The ad fires automatically when a viewer interacts with your video page.

### Step 4: Paste Your Ad Code

Copy the JavaScript snippet from your ad provider's dashboard and paste it into the "JavaScript Ad Code" textarea.

### Step 5: Enable & Save

Toggle the "Enable this Ad format" switch to ON and click "Save Configuration". Your ads will start serving immediately.

### What to Expect

- First impressions appear within 1-2 hours
- Revenue data updates every 24 hours in your provider dashboard
- Vercelplay takes 0% cut — your earnings are 100% yours`,
    category: 'Tutorial',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-08'),
  },
  {
    title: 'Understanding CPM, CPC, and CPI: A Creator\'s Guide',
    slug: 'understanding-cpm-cpc-cpi-creators-guide',
    excerpt: 'Demystifying ad pricing models so you can make informed decisions about which ad formats and networks will earn you the most.',
    content: `## Ad Pricing Models Explained

As a video creator, understanding how you get paid is crucial for maximizing your revenue.

### CPM (Cost Per Mille)

You earn money for every 1,000 ad impressions. This is the most common model for display ads and popunders.

**Best for:** High-traffic videos with passive viewers.

### CPC (Cost Per Click)

You earn money when a viewer clicks on the ad. Rates are higher per action but volume is lower.

**Best for:** Engaged audiences who interact with content.

### CPI (Cost Per Install)

You earn money when a viewer installs an app after clicking your ad. Highest payout per action.

**Best for:** Tech-savvy audiences on mobile devices.

### Which Should You Choose?

For most Vercelplay creators, **CPM popunders** offer the best passive income with zero effort. As your audience grows, layer in **CPC social bars** for incremental revenue.

| Model | Avg Payout | Effort | Best Format |
|-------|-----------|--------|-------------|
| CPM | $2-8 per 1K views | None | Popunder |
| CPC | $0.05-0.30 per click | Low | Social Bar |
| CPI | $0.50-2.00 per install | Medium | In-Stream |`,
    category: 'Monetization',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-05'),
  },
  {
    title: '5 Mistakes That Kill Your Ad Revenue (And How to Fix Them)',
    slug: '5-mistakes-kill-ad-revenue',
    excerpt: 'Common pitfalls that video creators make when setting up ads, and actionable fixes to recover lost revenue.',
    content: `## Stop Leaving Money on the Table

After analyzing hundreds of Vercelplay creator accounts, we identified the top 5 revenue-killing mistakes.

### 1. Running Too Many Ad Formats

**The mistake:** Stacking 4+ ad formats on a single page.
**The fix:** Maximum 2 ad formats. One pre-roll + one popunder is optimal.

### 2. Using Low Fill-Rate Networks

**The mistake:** Choosing niche networks with < 90% fill rate.
**The fix:** Stick with Adsterra or Monetag for guaranteed 95%+ fill rates.

### 3. Ignoring Geo-Targeting

**The mistake:** Treating all traffic equally.
**The fix:** Use different ad configs for Tier-1 (US/UK/EU) vs Tier-3 traffic. Tier-1 CPMs are 5-10x higher.

### 4. Not Testing Ad Placements

**The mistake:** Set it and forget it.
**The fix:** A/B test pre-roll vs. mid-roll placement monthly. Even small changes can boost eCPM by 20-30%.

### 5. Forgetting Mobile Optimization

**The mistake:** Desktop-only ad formats on mobile traffic.
**The fix:** Use Social Bar format for mobile viewers — it's non-intrusive and has high engagement rates.`,
    category: 'Monetization',
    status: 'published' as const,
    authorId: 'system',
    publishedAt: new Date('2026-04-01'),
  },
]

async function seed() {
  console.log('🌱 Seeding blog posts...')

  for (const post of SEED_POSTS) {
    try {
      await db.insert(blogPosts)
        .values(post)
        .onConflictDoUpdate({
          target: blogPosts.slug,
          set: {
            title: post.title,
            coverImageUrl: post.coverImageUrl,
            excerpt: post.excerpt,
            content: post.content,
            category: post.category,
            status: post.status,
            publishedAt: post.publishedAt,
            updatedAt: new Date()
          }
        })
      console.log(`  ✅ ${post.title}`)
    } catch (err: any) {
      console.log(`  ⚠️ Skipped "${post.title}": ${err.message}`)
    }
  }

  console.log('✅ Blog seed complete!')
  process.exit(0)
}

seed()
