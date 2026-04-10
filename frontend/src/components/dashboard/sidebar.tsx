import { Link, useLocation } from "react-router-dom"
import { 
  RiDashboardLine, 
  RiVideoLine, 
  RiAdvertisementLine, 
  RiSettings4Line,
  RiPlayCircleFill,
  RiBarChartBoxLine,
  RiShieldStarLine,
  RiFlashlightLine
} from "@remixicon/react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/auth-context"

const TOOLKIT_NAV = [
  {
    title: "Ads Toolkit",
    href: "/dashboard/ads",
    icon: RiAdvertisementLine,
  },
]

const MAIN_NAV = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: RiDashboardLine,
  },
  {
    title: "My Videos",
    href: "/dashboard/videos",
    icon: RiVideoLine,
  },
  {
    title: "All Analytics",
    href: "/dashboard/analytics",
    icon: RiBarChartBoxLine,
  },
]

const SECONDARY_NAV = [
  {
    title: "Billing & Plans",
    href: "/dashboard/billing",
    icon: RiFlashlightLine,
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: RiSettings4Line,
  },
]

const ADMIN_NAV = [
  {
    title: "Admin Studio",
    href: "/studio",
    icon: RiShieldStarLine,
  },
]

export function Sidebar({ className, isMobile }: { className?: string; isMobile?: boolean }) {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <aside className={cn("flex flex-col border-r border-border bg-background h-full", className)}>
      <div className={cn("flex h-14 items-center gap-2 border-b border-border/50", isMobile ? "px-6" : "px-4 lg:px-6 justify-center lg:justify-start")}>
        <RiPlayCircleFill className="size-5 text-primary shrink-0" />
        <span className={cn("text-sm font-semibold tracking-tight", !isMobile && "hidden lg:block")}>
          Vercelplay
        </span>
      </div>

      <div className={cn("flex flex-col gap-6", isMobile ? "p-4" : "p-2 lg:p-4")}>
        {user && (
          <div className={cn("px-3 mb-2 flex items-center justify-between", !isMobile && "hidden lg:flex")}>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Current Plan</span>
              <span className={cn("text-xs font-bold capitalize", 
                user.plan === 'pro' ? 'text-primary' : 
                user.plan === 'creator' ? 'text-purple-500' : 
                'text-muted-foreground'
              )}>
                {user.plan}
              </span>
            </div>
            {user.plan !== 'pro' && (
              <Link to="/dashboard/billing" className="text-[10px] font-bold text-primary hover:underline">UPGRADE</Link>
            )}
          </div>
        )}

        <div>
          <h4 className={cn("mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70", !isMobile && "hidden lg:block")}>
            Main
          </h4>
          <div className={cn("flex flex-col gap-1", !isMobile && "items-center lg:items-stretch")}>
            {MAIN_NAV.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== "/dashboard" && location.pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  title={!isMobile ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md font-medium transition-colors",
                    isMobile ? "px-3 py-2 text-sm" : "p-2 lg:px-3 text-sm",
                    isActive 
                      ? "bg-muted text-foreground" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className={cn("leading-none", !isMobile && "hidden lg:block")}>{item.title}</span>
                </Link>
              )
            })}
          </div>
        </div>

        <div>
          <h4 className={cn("mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70", !isMobile && "hidden lg:block")}>
            Monetization
          </h4>
          <div className={cn("flex flex-col gap-1", !isMobile && "items-center lg:items-stretch")}>
            {TOOLKIT_NAV.map((item) => {
              const isActive = location.pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  title={!isMobile ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md font-medium transition-colors",
                    isMobile ? "px-3 py-2 text-sm" : "p-2 lg:px-3 text-sm",
                    isActive 
                      ? "bg-muted text-foreground" 
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className={cn("leading-none", !isMobile && "hidden lg:block")}>{item.title}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {user?.role === 'admin' && (
          <div>
            <h4 className={cn("mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70", !isMobile && "hidden lg:block")}>
              Admin
            </h4>
            <div className={cn("flex flex-col gap-1", !isMobile && "items-center lg:items-stretch")}>
              {ADMIN_NAV.map((item) => {
                const isActive = location.pathname.startsWith(item.href)
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
              })}
            </div>
          </div>
        )}
      </div>

      <div className={cn("mt-auto", isMobile ? "p-4" : "p-2 lg:p-4")}>
        <h4 className={cn("mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70", !isMobile && "hidden lg:block")}>
          Preferences
        </h4>
        <div className={cn("flex flex-col gap-1", !isMobile && "items-center lg:items-stretch")}>
          {SECONDARY_NAV.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                title={!isMobile ? item.title : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md font-medium transition-colors",
                  isMobile ? "px-3 py-2 text-sm" : "p-2 lg:px-3 text-sm",
                  isActive 
                    ? "bg-muted text-foreground" 
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className={cn("leading-none", !isMobile && "hidden lg:block")}>{item.title}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </aside>
  )
}
