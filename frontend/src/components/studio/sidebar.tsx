import { Link, useLocation } from "react-router-dom"
import { 
  RiDashboardLine, 
  RiGroupLine,
  RiPriceTag3Line,
  RiSettings4Line,
  RiShieldStarFill,
  RiArrowLeftLine,
  RiHardDriveLine,
  RiPulseLine,
  RiArticleLine,
  RiExchangeDollarLine,
  RiGlobalLine,
} from "@remixicon/react"
import { cn } from "@/lib/utils"

// ─── Navigation config ────────────────────────────────────────────

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const MAIN_NAV: NavItem[] = [
  { title: "Dashboard",    href: "/studio",              icon: RiDashboardLine },
  { title: "Users",        href: "/studio/users",        icon: RiGroupLine },
  { title: "Plans & Tiers", href: "/studio/plans",       icon: RiPriceTag3Line },
  { title: "Transactions", href: "/studio/transactions", icon: RiExchangeDollarLine },
  { title: "Blog",         href: "/studio/blog",         icon: RiArticleLine },
]

const SERVER_NAV: NavItem[] = [
  { title: "Domains",        href: "/studio/domains",        icon: RiGlobalLine },
  { title: "Storage",        href: "/studio/storage",        icon: RiHardDriveLine },
  { title: "Worker Monitor", href: "/studio/worker-monitor", icon: RiPulseLine },
]

const BOTTOM_NAV: NavItem[] = [
  { title: "Settings", href: "/studio/settings", icon: RiSettings4Line },
]

// ─── Component ────────────────────────────────────────────────────

export function StudioSidebar({ className, isMobile }: { className?: string; isMobile?: boolean }) {
  const location = useLocation()

  const isLinkActive = (href: string) =>
    location.pathname === href || (href !== "/studio" && location.pathname.startsWith(href))

  const renderNavItem = (item: NavItem) => {
    const isActive = isLinkActive(item.href)
    return (
      <Link
        key={item.href}
        to={item.href}
        title={!isMobile ? item.title : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md font-medium transition-colors",
          isMobile ? "px-3 py-2 text-sm" : "p-2 lg:px-3 text-sm",
          isActive 
            ? "bg-primary/10 text-primary" 
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
      >
        <item.icon className="size-4 shrink-0" />
        <span className={cn("leading-none", !isMobile && "hidden lg:block")}>{item.title}</span>
      </Link>
    )
  }

  return (
    <aside className={cn("flex flex-col border-r border-border bg-background h-full", className)}>
      {/* ── Header ── */}
      <div className={cn(
        "flex h-14 items-center gap-2 border-b border-border/50",
        isMobile ? "px-6" : "px-4 lg:px-6 justify-center lg:justify-start"
      )}>
        <RiShieldStarFill className="size-5 text-primary shrink-0" />
        <span className={cn("text-sm font-semibold tracking-tight", !isMobile && "hidden lg:block")}>
          Admin Studio
        </span>
      </div>

      {/* ── Back link ── */}
      <div className={cn("border-b border-border/30", isMobile ? "px-4 py-3" : "p-2 lg:px-4 lg:py-3")}>
        <Link
          to="/dashboard"
          className={cn(
            "flex items-center gap-3 rounded-md font-medium transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            isMobile ? "px-3 py-2 text-sm" : "p-2 lg:px-3 text-sm"
          )}
        >
          <RiArrowLeftLine className="size-4 shrink-0" />
          <span className={cn("leading-none", !isMobile && "hidden lg:block")}>Back to App</span>
        </Link>
      </div>

      {/* ── Main nav (flat list) ── */}
      <nav className={cn(
        "flex flex-col flex-1 overflow-y-auto",
        isMobile ? "p-4" : "p-2 lg:p-4",
        !isMobile && "items-center lg:items-stretch"
      )}>
        <div className="flex flex-col gap-0.5">
          {MAIN_NAV.map(renderNavItem)}
        </div>

        {/* ── Server ── */}
        <div className="mt-5">
          <h4 className={cn(
            "mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70",
            !isMobile && "hidden lg:block"
          )}>
            Server
          </h4>
          <div className={cn("flex flex-col gap-0.5", !isMobile && "items-center lg:items-stretch")}>
            {SERVER_NAV.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* ── Bottom nav (pinned) ── */}
      <div className={cn(
        "flex flex-col gap-0.5 border-t border-border/30",
        isMobile ? "p-4" : "p-2 lg:p-4",
        !isMobile && "items-center lg:items-stretch"
      )}>
        {BOTTOM_NAV.map(renderNavItem)}
      </div>
    </aside>
  )
}
