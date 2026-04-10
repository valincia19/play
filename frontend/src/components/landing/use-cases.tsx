import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  RiLiveLine,
  RiGraduationCapLine,
  RiFilmLine,
} from "@remixicon/react"

interface UseCase {
  icon: React.ElementType
  title: string
  description: string
  tags: string[]
}

const USE_CASES: UseCase[] = [
  {
    icon: RiLiveLine,
    title: "Live Streaming",
    description:
      "Broadcast live events, webinars, and conferences with ultra-low latency. Real-time chat and viewer analytics included.",
    tags: ["Low Latency", "Chat", "Analytics"],
  },
  {
    icon: RiGraduationCapLine,
    title: "E-Learning",
    description:
      "Host course libraries with DRM protection. Track student engagement, completion rates, and paywall access per video.",
    tags: ["DRM", "Paywall", "Progress Tracking"],
  },
  {
    icon: RiFilmLine,
    title: "Media & Entertainment",
    description:
      "OTT-ready delivery with ad insertion, multi-region CDN, and branded player experiences for your audience.",
    tags: ["Ad Insertion", "Branded Player", "OTT"],
  },
]

export function UseCases() {
  return (
    <section id="use-cases" className="bg-muted/30 px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center md:mb-16">
          <p className="mb-3 text-sm font-medium text-primary">Use Cases</p>
          <h2 className="text-3xl font-bold tracking-tight md:text-5xl">
            Built for every{" "}
            <span className="text-muted-foreground">video workflow</span>
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USE_CASES.map((useCase) => (
            <Card
              key={useCase.title}
              className="border border-border bg-card transition-all duration-300 hover:bg-muted/40"
            >
              <CardHeader className="gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-primary">
                  <useCase.icon className="size-5" />
                </div>
                <CardTitle className="text-sm font-semibold">
                  {useCase.title}
                </CardTitle>
                <CardDescription className="leading-relaxed">
                  {useCase.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {useCase.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
