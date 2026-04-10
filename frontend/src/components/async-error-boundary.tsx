import React, { ReactNode, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RiAlertLine, RiLoader4Line, RiRefreshLine } from '@remixicon/react'
import { toast } from 'sonner'

interface Props {
  children: (params: {
    retry: () => void
    isLoading: boolean
    error: Error | null
  }) => ReactNode
  onRetry?: () => Promise<void>
  maxRetries?: number
  onError?: (error: Error) => void
}

interface State {
  isLoading: boolean
  error: Error | null
  retryCount: number
}

/**
 * Async Error Boundary
 *
 * Handles errors in asynchronous operations like data fetching,
 * with built-in retry logic and loading states.
 *
 * Usage:
 * ```tsx
 * <AsyncErrorBoundary
 *   onRetry={async () => {
 *     await fetchData()
 *   }}
 *   maxRetries={3}
 * >
 *   {({ retry, isLoading, error }) => (
 *     <div>
 *       <button onClick={retry} disabled={isLoading}>
 *         {isLoading ? 'Loading...' : 'Refresh'}
 *       </button>
 *       {error && <p>{error.message}</p>}
 *     </div>
 *   )}
 * </AsyncErrorBoundary>
 * ```
 */
export function AsyncErrorBoundary({
  children,
  onRetry,
  maxRetries = 3,
  onError
}: Props) {
  const [state, setState] = useState<State>({
    isLoading: false,
    error: null,
    retryCount: 0
  })

  const retry = useCallback(async () => {
    if (!onRetry || state.isLoading) return

    if (state.retryCount >= maxRetries) {
      toast.error('Maximum retry attempts reached')
      return
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }))

    try {
      await onRetry()
      setState({ isLoading: false, error: null, retryCount: 0 })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      setState(prev => ({
        isLoading: false,
        error: err,
        retryCount: prev.retryCount + 1
      }))

      onError?.(err)

      // Show user-friendly error message
      const remainingRetries = maxRetries - state.retryCount
      if (remainingRetries > 0) {
        toast.error(`Request failed. ${remainingRetries} retry attempts remaining.`)
      } else {
        toast.error('Request failed after multiple attempts. Please try again later.')
      }
    }
  }, [onRetry, maxRetries, state.isLoading, state.retryCount, onError])

  return <>{children({ retry, isLoading: state.isLoading, error: state.error })}</>
}

/**
 * Enhanced useAsync hook with error boundary integration
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  options: {
    onSuccess?: (data: T) => void
    onError?: (error: Error) => void
    maxRetries?: number
    retryDelay?: number
    immediate?: boolean
  } = {}
) {
  const [state, setState] = useState<{
    data: T | null
    isLoading: boolean
    error: Error | null
    retryCount: number
  }>({
    data: null,
    isLoading: options.immediate ?? false,
    error: null,
    retryCount: 0
  })

  const execute = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))

    const maxRetries = options.maxRetries ?? 3
    const retryDelay = options.retryDelay ?? 1000
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await asyncFn()
        setState({ data: result, isLoading: false, error: null, retryCount: 0 })
        options.onSuccess?.(result)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)))
        }
      }
    }

    // All retries failed
    setState(prev => ({
      data: null,
      isLoading: false,
      error: lastError,
      retryCount: prev.retryCount + 1
    }))

    options.onError?.(lastError!)
    throw lastError
  }, [asyncFn, options, options.maxRetries, options.retryDelay])

  // Auto-execute if immediate is true
  React.useEffect(() => {
    if (options.immediate) {
      execute()
    }
  }, [options.immediate, execute])

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    execute,
    retryCount: state.retryCount
  }
}

/**
 * API Error Boundary Component
 *
 * Specialized boundary for API calls with retry logic and error categorization
 */
export interface ApiErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onRetry?: () => Promise<void>
}

export function ApiErrorBoundary({ children, fallback, onRetry }: ApiErrorBoundaryProps) {
  const [state, setState] = useState<{
    error: Error | null
    isRetrying: boolean
  }>({
    error: null,
    isRetrying: false
  })

  const handleRetry = async () => {
    if (!onRetry || state.isRetrying) return

    setState(prev => ({ ...prev, isRetrying: true, error: null }))

    try {
      await onRetry()
      setState({ error: null, isRetrying: false })
    } catch (error) {
      setState({
        error: error instanceof Error ? error : new Error(String(error)),
        isRetrying: false
      })
    }
  }

  // Use React Error Boundary for component errors
  return (
    <ErrorBoundary
      fallback={fallback}
      onError={(error) => {
        setState({ error, isRetrying: false })
      }}
    >
      {state.error ? (
        fallback || (
          <Card className="max-w-md mx-auto mt-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <RiAlertLine className="h-5 w-5 text-destructive" />
                <CardTitle>API Error</CardTitle>
              </div>
              <CardDescription>
                {state.error.message}
              </CardDescription>
            </CardHeader>
            {onRetry && (
              <CardContent>
                <Button
                  onClick={handleRetry}
                  disabled={state.isRetrying}
                  className="w-full"
                >
                  {state.isRetrying ? (
                    <>
                      <RiLoader4Line className="h-4 w-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RiRefreshLine className="h-4 w-4 mr-2" />
                      Retry Request
                    </>
                  )}
                </Button>
              </CardContent>
            )}
          </Card>
        )
      ) : (
        children
      )}
    </ErrorBoundary>
  )
}

// Import ErrorBoundary for internal use
// We'll import it from the error-boundary file
interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

// Simple ErrorBoundary wrapper for this component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean; error: Error | null }> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null
    }
    return this.props.children
  }
}