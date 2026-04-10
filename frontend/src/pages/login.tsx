import React from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthForm } from "@/components/auth/auth-form"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { api, type LoginInput, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

export function Login() {
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { refreshUser } = useAuth()

  // Where to redirect after login (default: /dashboard)
  const from = (location.state as any)?.from || '/dashboard'

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const data: LoginInput = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    try {
      setIsLoading(true)
      const response = await api.login(data)

      // Store tokens
      localStorage.setItem('accessToken', response.accessToken)
      localStorage.setItem('refreshToken', response.refreshToken)

      // Refresh auth context with the new user data
      await refreshUser()

      // Navigate to intended destination
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        // Redirect to verify-info if not verified (backend auto-resends email)
        if (err.code === 'USER_NOT_VERIFIED') {
          navigate('/verify-info', {
            state: { message: err.message }
          })
          return
        }
        setError(err.message)
      } else {
        setError('An unexpected error occurred')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Enter your email to sign in to your account"
      footer={
        <p className="text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">
            Register
          </Link>
        </p>
      }
    >
      <AuthForm type="login" onSubmit={handleSubmit} isLoading={isLoading} error={error} />
    </AuthCard>
  )
}
