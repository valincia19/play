import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"

export function NotFound() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center relative">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        <div className="relative z-10 space-y-4">
          <h1 className="text-9xl font-black text-primary/10 tracking-tighter">404</h1>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Page not found</h2>
          <p className="text-muted-foreground max-w-[500px] mx-auto pb-4">
            The video or page you are looking for doesn't exist, has been moved, or may have been deleted.
          </p>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link to="/">
              Return to Homepage
            </Link>
          </Button>
        </div>
      </main>

      <Footer />
    </div>
  )
}
