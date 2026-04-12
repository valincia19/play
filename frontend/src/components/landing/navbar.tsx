import { Button } from "@/components/ui/button"
import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/auth-context"

export function Navbar() {
  const { user } = useAuth()

  return (
    <header className="fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.webp" alt="Vercelplay" className="size-5 shrink-0" />
          <span className="text-sm font-semibold tracking-tight">
            Vercelplay
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="/#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="/#how-it-works" className="transition-colors hover:text-foreground">
            How It Works
          </a>
          <a href="/#use-cases" className="transition-colors hover:text-foreground">
            Use Cases
          </a>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <Button size="sm" asChild>
              <Link to={user.role === 'admin' ? '/studio' : '/dashboard'}>
                Dashboard
              </Link>
            </Button>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                Sign in
              </Link>
              <Button size="sm" asChild>
                <Link to="/register">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
