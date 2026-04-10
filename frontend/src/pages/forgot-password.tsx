import React from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthForm } from "@/components/auth/auth-form"
import { Link } from "react-router-dom"

export function ForgotPassword() {
  const [isLoading, setIsLoading] = React.useState(false)
  const [isSent, setIsSent] = React.useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    // Mock API
    setTimeout(() => {
      setIsLoading(false)
      setIsSent(true)
    }, 1500)
  }

  if (isSent) {
    return (
      <AuthCard
        title="Check your email"
        description="We've sent a password reset link if the email exists in our system."
        footer={
          <p className="text-sm text-muted-foreground">
            Remembered your password?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Back to login
            </Link>
          </p>
        }
      >
        <div className="flex justify-center text-center">
          <p className="text-sm text-muted-foreground">
            You can close this window now and check your inbox.
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset Password"
      description="Enter your email address and we'll send you a link to reset your password."
      footer={
        <p className="text-sm text-muted-foreground">
          Remembered your password?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to login
          </Link>
        </p>
      }
    >
      <AuthForm type="forgot-password" onSubmit={handleSubmit} isLoading={isLoading} />
    </AuthCard>
  )
}
