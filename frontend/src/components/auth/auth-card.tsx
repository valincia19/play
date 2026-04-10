import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import type { ReactNode } from "react"

interface AuthCardProps {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      {/* Background depth without heavy effects */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="z-10 mb-8 flex flex-col items-center justify-center text-center">
        {/* Removed Play Circle icon for a cleaner look */}
      </div>

      <Card className="z-10 w-full max-w-md border-border bg-card shadow-sm sm:w-[400px]">
        <CardHeader className="space-y-2 pb-6 pt-8 text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          {children}
        </CardContent>
        {footer && (
          <CardFooter className="flex flex-col items-center border-t border-border/50 pb-8 pt-6">
            {footer}
          </CardFooter>
        )}
      </Card>
      
      <p className="z-10 mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Vercelplay. All rights reserved.
      </p>
    </div>
  )
}
