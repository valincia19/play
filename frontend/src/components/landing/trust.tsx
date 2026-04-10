import {
  RiCloudLine,
  RiDatabase2Line,
  RiGlobalLine,
  RiShieldCheckLine,
} from "@remixicon/react"

const INFRASTRUCTURE = [
  { icon: RiCloudLine, name: "Cloudflare R2" },
  { icon: RiDatabase2Line, name: "AWS S3" },
  { icon: RiGlobalLine, name: "Global CDN" },
  { icon: RiShieldCheckLine, name: "DRM Protected" },
]

export function Trust() {
  return (
    <section className="bg-background px-6 py-20 md:py-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50">
          Powered by industry-leading infrastructure
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {INFRASTRUCTURE.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <item.icon className="size-4" />
              <span>{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
