import { Outlet, useNavigate, Navigate } from "react-router-dom"
import { StudioSidebar } from "@/components/studio/sidebar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  RiMenuLine,
  RiShieldStarFill,
  RiLogoutBoxLine,
  RiUserLine,
  RiDashboardLine
} from "@remixicon/react"
import { useAuth } from "@/contexts/auth-context"

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

function getAvatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

export function StudioLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Protect the Studio Layout: only allow admins
  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user ? getInitials(user.name) : 'A'
  const avatarBg = user ? getAvatarColor(user.id) : 'hsl(0, 0%, 50%)'

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="hidden md:flex">
        <StudioSidebar className="fixed inset-y-0 w-16 lg:w-64" />
      </div>

      <main className="flex w-full flex-1 flex-col md:pl-16 lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 md:px-6 lg:px-8 backdrop-blur">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 md:hidden">
                  <RiMenuLine className="size-5" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0 border-r border-border">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <SheetDescription className="sr-only">Navigation</SheetDescription>
                <StudioSidebar isMobile={true} className="w-full border-r-0" />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2 md:hidden">
              <RiShieldStarFill className="size-5 text-primary shrink-0" />
              <span className="text-sm font-semibold tracking-tight">Admin Studio</span>
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 md:gap-4">
             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <button
                   className="size-8 rounded-full flex items-center justify-center overflow-hidden shrink-0 cursor-pointer ring-offset-background transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                   style={{ backgroundColor: avatarBg }}
                 >
                   <span className="text-xs font-semibold text-white select-none">
                     {initials}
                   </span>
                 </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-56">
                 <DropdownMenuLabel className="font-normal relative">
                    <div className="flex flex-col space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium leading-none">{user.name}</p>
                        <span className="bg-primary/20 text-primary text-[10px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider">Admin</span>
                      </div>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                   <RiDashboardLine className="mr-2 size-4" />
                   Back to Dashboard
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>
                   <RiUserLine className="mr-2 size-4" />
                   Profile Settings
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem
                   onClick={handleLogout}
                   className="text-destructive focus:text-destructive"
                 >
                   <RiLogoutBoxLine className="mr-2 size-4" />
                   Logout
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
