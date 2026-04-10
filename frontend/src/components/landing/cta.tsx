import { Button } from "@/components/ui/button"
import { RiArrowRightLine } from "@remixicon/react"

export function CTA() {
  return (
    <section id="cta" className="bg-background px-6 py-24 md:py-32">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-muted/30 px-8 py-16 text-center md:px-16 md:py-20">
        <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
          Ready to take control{" "}
          <span className="text-muted-foreground">of your video?</span>
        </h2>

        <p className="mt-6 text-muted-foreground">
          Join thousands of creators and businesses streaming with Vercelplay.
          Start for free - upgrade when you're ready.
        </p>

        <Button size="lg" className="mt-8 gap-2">
          Get Started Free
          <RiArrowRightLine className="size-4" />
        </Button>

        <p className="mt-4 text-xs text-muted-foreground">
          No credit card required · Cancel anytime
        </p>
      </div>
    </section>
  )
}
