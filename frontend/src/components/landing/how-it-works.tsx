import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

interface Step {
  number: string
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    number: "01",
    title: "Upload Your Videos",
    description:
      "Drag and drop or use our API. We handle transcoding, thumbnail generation, and adaptive bitrate encoding automatically.",
  },
  {
    number: "02",
    title: "Configure & Monetize",
    description:
      "Set privacy rules, attach ad campaigns, and configure your player. Our Ads Toolkit starts earning revenue immediately.",
  },
  {
    number: "03",
    title: "Stream & Scale",
    description:
      "Embed anywhere with a single line. Our CDN scales automatically - from 10 viewers to 10 million, latency stays low.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-background px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center md:mb-16">
          <p className="mb-3 text-sm font-medium text-primary">How It Works</p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Three steps to{" "}
            <span className="text-muted-foreground">live in minutes</span>
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card
              key={step.number}
              className="border border-border bg-card transition-all duration-300 hover:bg-muted/40"
            >
              <CardHeader className="gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted font-mono text-sm font-bold text-primary">
                  {step.number}
                </div>
                <CardTitle className="text-sm font-semibold">
                  {step.title}
                </CardTitle>
                <CardDescription className="leading-relaxed">
                  {step.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
