import React from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { RiMailLine } from "@remixicon/react"

export function VerifyInfo() {
  const navigate = useNavigate()
  const location = useLocation()
  const message = location.state?.message || 'Check your email to verify your account.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center space-y-8 py-16">
          <div className="flex items-center justify-center mb-6">
            <div className="rounded-full bg-primary/10 p-6">
              <RiMailLine className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-foreground mb-2">
            Check Your Email
          </h1>
          <p className="text-center text-muted-foreground mb-8">
            {message}
          </p>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              We've sent a verification link to your email address.
            </p>
            <p className="text-sm text-muted-foreground text-center">
              Please check your inbox (and spam folder) and click the link to verify your account.
            </p>
          </div>
          <Button
            className="w-full max-w-xs mx-auto"
            onClick={() => navigate('/login')}
          >
            Go to Login
          </Button>
        </div>
      </div>
    </div>
  )
}
