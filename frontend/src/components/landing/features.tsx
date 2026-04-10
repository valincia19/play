import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  RiShieldKeyholeLine,
  RiBarChartBoxLine,
  RiGlobalLine,
  RiSpeedLine,
  RiCodeLine,
  RiMoneyDollarCircleLine,
} from "@remixicon/react"

interface FeatureItem {
  icon: React.ElementType
  title: string
  description: string
}

const FEATURES: FeatureItem[] = [
  {
    icon: RiShieldKeyholeLine,
    title: "Private & Secure",
    description:
      "DRM-protected delivery with signed URLs. Your content stays yours - no leaks, no piracy.",
  },
  {
    icon: RiMoneyDollarCircleLine,
    title: "Built-in Monetization",
    description:
      "Ads Toolkit with CPC/CPI tracking, redirect-based delivery, and real-time revenue analytics.",
  },
  {
    icon: RiGlobalLine,
    title: "Global CDN",
    description:
      "Edge-optimized delivery across 200+ PoPs. Sub-second latency worldwide, every time.",
  },
  {
    icon: RiSpeedLine,
    title: "Adaptive Streaming",
    description:
      "HLS & DASH with auto quality switching. Flawless playback on any device, any bandwidth.",
  },
  {
    icon: RiBarChartBoxLine,
    title: "Deep Analytics",
    description:
      "Per-video metrics, engagement heatmaps, and audience insights - all in real time.",
  },
  {
    icon: RiCodeLine,
    title: "Developer-First API",
    description:
      "RESTful API with webhooks, SDKs, and embed codes. Integrate in minutes, not days.",
  },
]

export function Features() {
  return (
    <section id="features" className="bg-background px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center md:mb-16">
          <p className="mb-3 text-sm font-medium text-primary">Features</p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Everything you need to{" "}
            <span className="text-muted-foreground">
              deliver video at scale
            </span>
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="border border-border bg-card transition-all duration-300 hover:bg-muted/40"
            >
              <CardHeader className="gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                  <feature.icon className="size-5" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  {feature.title}
                </CardTitle>
                <CardDescription className="leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
