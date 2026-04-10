import { Navbar } from "@/components/landing/navbar"
import { Hero } from "@/components/landing/hero"
import { Trust } from "@/components/landing/trust"
import { Features } from "@/components/landing/features"
import { ProductPreview } from "@/components/landing/product-preview"
import { HowItWorks } from "@/components/landing/how-it-works"
import { UseCases } from "@/components/landing/use-cases"
import { CTA } from "@/components/landing/cta"
import { Pricing } from "@/components/landing/pricing"
import { Footer } from "@/components/landing/footer"

export function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <main className="pt-14">
        <Hero />
        <Trust />
        <Features />
        <ProductPreview />
        <HowItWorks />
        <UseCases />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
