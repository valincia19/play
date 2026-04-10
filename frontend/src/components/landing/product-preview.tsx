import { RiPlayLargeFill, RiFullscreenLine } from "@remixicon/react"

export function ProductPreview() {
  return (
    <section
      id="product-preview"
      className="bg-muted/30 px-6 py-24 md:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center md:mb-16">
          <p className="mb-3 text-sm font-medium text-primary">Product</p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            See it in action
          </h2>
          <p className="mt-4 text-muted-foreground">
            Adaptive HLS player with DRM protection and real-time analytics
          </p>
        </div>

        {/* Video player mockup */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="relative aspect-video w-full bg-background">
            {/* Center play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <button className="flex size-16 items-center justify-center rounded-full border border-border bg-card transition-all duration-300 hover:bg-muted md:size-20">
                <RiPlayLargeFill className="size-6 text-foreground md:size-8" />
              </button>
            </div>

            {/* Bottom controls */}
            <div className="absolute right-0 bottom-0 left-0 border-t border-border bg-card/80 p-3 backdrop-blur-sm md:p-4">
              {/* Progress bar */}
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full w-[35%] rounded-full bg-primary" />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <RiPlayLargeFill className="size-3.5" />
                  <span>2:14 / 6:30</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] font-medium">
                    1080p
                  </span>
                  <RiFullscreenLine className="size-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
