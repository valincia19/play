import { useEffect, useState, useRef, useCallback } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RiCheckLine, RiLoader4Line, RiErrorWarningLine } from "@remixicon/react"

export function Verify() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  // Guard against React Strict Mode double-execution
  const verifyAttempted = useRef(false)

  const verifyEmail = useCallback(async (token: string) => {
    // Prevent double-call from React StrictMode in development
    if (verifyAttempted.current) return
    verifyAttempted.current = true

    try {
      const result = await api.verify(token)
      setStatus('success')
      setMessage(result.message)
    } catch (err) {
      setStatus('error')
      if (err instanceof ApiError) {
        setErrorCode(err.code)
        if (err.code === 'INVALID_TOKEN') {
          setMessage('Invalid or expired verification link.')
        } else if (err.code === 'TOKEN_EXPIRED') {
          setMessage('Verification link has expired.')
        } else if (err.code === 'USER_NOT_FOUND') {
          setMessage('User not found. Please try registering again.')
        } else {
          setMessage(err.message || 'An error occurred. Please try again.')
        }
      } else {
        setMessage('An error occurred. Please try again.')
      }
    }
  }, [])

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      // Wrap setState in setTimeout to avoid calling it synchronously in effect
      setTimeout(() => {
        setStatus('error')
        setMessage('Invalid verification link. Token is missing.')
      }, 0)
      return
    }

    setTimeout(() => {
      verifyEmail(token)
    }, 0)
  }, [searchParams, verifyEmail])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {status === 'loading' ? (
          <div className="flex flex-col items-center justify-center space-y-6 py-16">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="rounded-full bg-primary/10 p-4">
                <RiLoader4Line className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">Verifying your email...</p>
              <p className="text-sm text-muted-foreground">Please wait while we verify your account.</p>
            </div>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center justify-center space-y-8 py-16">
            <div className="flex items-center justify-center mb-6">
              <div className="rounded-full bg-green-500/10 p-6">
                <RiCheckLine className="h-16 w-16 text-green-500" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center text-foreground mb-2">
              Email Verified!
            </h1>
            <p className="text-center text-muted-foreground mb-8">
              {message || 'Your email has been successfully verified.'}
            </p>
            <Button
              className="w-full max-w-xs mx-auto"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-8 py-16">
            <div className="flex items-center justify-center mb-6">
              <div className="rounded-full bg-destructive/10 p-6">
                <RiErrorWarningLine className="h-16 w-16 text-destructive" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-center text-destructive mb-2">
              Verification Failed
            </h1>
            <p className="text-center text-muted-foreground mb-8">
              {message || 'An error occurred during verification.'}
            </p>
            {errorCode === 'TOKEN_EXPIRED' && (
              <div className="text-center">
                <Badge variant="destructive" className="mb-4">Link Expired</Badge>
                <p className="text-sm text-muted-foreground">
                  The verification link has expired. Please register again to get a new verification email.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/register')}
              >
                Register Again
              </Button>
              <Button
                className="flex-1"
                onClick={() => navigate('/login')}
              >
                Go to Login
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
