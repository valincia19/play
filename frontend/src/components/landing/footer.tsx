import {
  RiGithubFill,
  RiTwitterXFill,
} from "@remixicon/react"
import { Link } from "react-router-dom"

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand & Description */}
          <div className="md:col-span-1 lg:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.webp" alt="Vercelplay" className="size-5 shrink-0" />
              <span className="text-base font-semibold tracking-tight">
                Vercelplay
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Private video hosting with built-in monetization. Stream, protect,
              and earn - all from one platform.
            </p>
            <div className="mt-6 flex items-center gap-4 text-muted-foreground">
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
                aria-label="Twitter"
              >
                <RiTwitterXFill className="size-5" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
                aria-label="GitHub"
              >
                <RiGithubFill className="size-5" />
              </a>
            </div>
          </div>

          {/* Links - Product */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Product</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="/#features" className="transition-colors hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="/#pricing" className="transition-colors hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/#how-it-works" className="transition-colors hover:text-foreground">
                  API
                </a>
              </li>
            </ul>
          </div>

          {/* Links - Company */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Company</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <a href="/#use-cases" className="transition-colors hover:text-foreground">
                  About
                </a>
              </li>
              <li>
                <a href="mailto:hello@vercelplay.com" className="transition-colors hover:text-foreground">
                  Contact
                </a>
              </li>
              <li>
                <Link to="/blog" className="transition-colors hover:text-foreground">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Links - Legal */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Legal</h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              <li>
                <Link to="/privacy" className="transition-colors hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="transition-colors hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 border-t border-border pt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Vercelplay. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50 opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-primary"></span>
              </span>
              All systems normal
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

