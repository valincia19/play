import * as React from "react"
import type { FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RiEyeOffLine, RiEyeLine, RiLoader4Line } from "@remixicon/react"
import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"

interface AuthFormProps {
  type: "login" | "register" | "forgot-password"
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  isLoading?: boolean
  error?: string | null
}

export function AuthForm({ type, onSubmit, isLoading = false, error }: AuthFormProps) {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      {error && (
        <div className="flex items-center justify-center rounded-lg bg-destructive/10 border border-destructive/20 p-3 mb-4">
          <Badge variant="destructive" className="mr-2">Error</Badge>
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {type === "register" && (
        <div className="space-y-2">
          <Label htmlFor="name" className="mb-1.5 block">Full Name</Label>
          <Input
            id="name"
            name="name"
            placeholder="John Doe"
            required
            disabled={isLoading}
            autoComplete="name"
            className="h-11"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="mb-1.5 block">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
          disabled={isLoading}
          autoComplete="email"
          className="h-11"
        />
      </div>

      {type !== "forgot-password" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="password">Password</Label>
            {type === "login" && (
              <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              disabled={isLoading}
              autoComplete={type === "login" ? "current-password" : "new-password"}
              className="h-11 pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <RiEyeLine className="size-4" />
              ) : (
                <RiEyeOffLine className="size-4" />
              )}
            </button>
          </div>
        </div>
      )}

      <Button type="submit" className="mt-2 h-11 w-full" disabled={isLoading}>
        {isLoading && <RiLoader4Line className="mr-2 size-4 animate-spin" />}
        {type === "login" ? "Sign In" : type === "register" ? "Create Account" : "Send Reset Link"}
      </Button>
    </form>
  )
}
