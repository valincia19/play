import { Outlet, useNavigate } from "react-router-dom"
import { Sidebar } from "@/components/dashboard/sidebar"
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
  RiPlayCircleFill,
  RiNotification3Line,
  RiLogoutBoxLine,
  RiSettings4Line,
  RiUserLine,
} from "@remixicon/react"
import { useAuth } from "@/contexts/auth-context"

/**
 * Extracts initials from a user name.
 * "John Doe" → "JD", "alice" → "AL"
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

/**
 * Generates a consistent HSL color from a string (user ID or email).
 */
function getAvatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user ? getInitials(user.name) : 'U'
  const avatarBg = user ? getAvatarColor(user.id) : 'hsl(0, 0%, 50%)'

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Desktop & Tablet Sidebar */}
      <div className="hidden md:flex">
        <Sidebar className="fixed inset-y-0 w-16 lg:w-64" />
      </div>

      <main className="flex w-full flex-1 flex-col md:pl-16 lg:pl-64">
        {/* Universal Top Header */}
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
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <SheetDescription className="sr-only">Access dashboard navigation links</SheetDescription>
                <Sidebar isMobile={true} className="w-full border-r-0" />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2 md:hidden">
              <RiPlayCircleFill className="size-5 text-primary shrink-0" />
              <span className="text-sm font-semibold tracking-tight">Vercelplay</span>
            </div>
          </div>
          
          <div className="flex items-center justify-end gap-3 md:gap-4">
             <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground relative">
               <RiNotification3Line className="size-5" />
               <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
             </Button>

             {/* User Avatar Dropdown */}
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
                 <DropdownMenuLabel className="font-normal">
                   <div className="flex flex-col space-y-1">
                     <p className="text-sm font-medium leading-none">{user?.name}</p>
                     <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                   </div>
                 </DropdownMenuLabel>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>
                   <RiSettings4Line className="mr-2 size-4" />
                   Settings
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                   <RiUserLine className="mr-2 size-4" />
                   Profile
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

        {/* Responsive Content Area */}
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
