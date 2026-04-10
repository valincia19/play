import React from "react"
import { AuthCard } from "@/components/auth/auth-card"
import { AuthForm } from "@/components/auth/auth-form"
import { Link, useNavigate } from "react-router-dom"
import { api, type RegisterInput, ApiError } from "@/lib/api"

export function Register() {
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const formData = new FormData(e.currentTarget)
    const data: RegisterInput = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    try {
      setIsLoading(true)
      const response = await api.register(data)

      // Show success message and redirect to verify info
      navigate('/verify-info', {
        state: { message: response.message }
      })
    } catch (err) {
      if (err instanceof ApiError) {
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
      title="Create an account"
      description="Enter your details to get started with Vercelplay"
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Login
          </Link>
        </p>
      }
    >
      <AuthForm type="register" onSubmit={handleSubmit} isLoading={isLoading} error={error} />
    </AuthCard>
  )
}
