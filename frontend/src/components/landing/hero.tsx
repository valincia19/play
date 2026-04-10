import { Button } from "@/components/ui/button"
import {
  RiPlayCircleLine,
  RiArrowRightLine,
} from "@remixicon/react"
import { Link } from "react-router-dom"

function DashboardPreview() {
  return (
    <div className="mx-auto mt-16 w-full max-w-5xl px-6 md:mt-20">
      <div className="animate-float overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="flex gap-1.5">
            <div className="size-2.5 rounded-full bg-muted-foreground/20" />
            <div className="size-2.5 rounded-full bg-muted-foreground/20" />
            <div className="size-2.5 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="ml-3 text-xs text-muted-foreground">
            app.vercelplay.com/dashboard
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-12">
          {/* Sidebar */}
          <div className="col-span-3 hidden border-r border-border p-4 md:block">
            <div className="space-y-1">
              {["Dashboard", "Videos", "Analytics", "Monetize", "Settings"].map(
                (item, i) => (
                  <div
                    key={item}
                    className={`rounded-lg px-3 py-2 text-xs ${
                      i === 0
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Main */}
          <div className="col-span-12 space-y-4 p-5 md:col-span-9">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Views", value: "2.4M", change: "+12.5%" },
                { label: "Revenue", value: "$18.2K", change: "+8.3%" },
                { label: "Bandwidth", value: "847 GB", change: "+5.1%" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-background p-3"
                >
                  <p className="text-[0.65rem] text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{stat.value}</p>
                  <p className="text-[0.65rem] text-primary">{stat.change}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                Views · Last 30 days
              </p>
              <div className="flex h-28 items-end gap-1">
                {[35, 50, 40, 65, 55, 80, 60, 75, 70, 90, 78, 95].map(
                  (h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-primary/20"
                      style={{ height: `${h}%` }}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden bg-background px-6 pt-24 pb-24 md:pt-32 md:pb-32">
      {/* Subtle background grid */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Subtle breathing glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-[120px] animate-breathe" />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <p className="mb-4 text-sm font-medium text-primary">
          Video Infrastructure for Developers
        </p>

        <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Your videos,{" "}
          <span className="text-muted-foreground">your platform.</span>
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Private video hosting with built-in monetization. Stream, protect, and
          earn from your content - all from one dashboard.
        </p>

        <div className="mt-10 flex gap-3">
          <Button size="lg" className="gap-2" asChild>
            <Link to="/register">
              <RiPlayCircleLine className="size-4" />
              Start Streaming
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="gap-2" asChild>
            <a href="#how-it-works">
              See How It Works
              <RiArrowRightLine className="size-4" />
            </a>
          </Button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          No credit card required · Free tier available
        </p>
      </div>

      <DashboardPreview />
    </section>
  )
}
