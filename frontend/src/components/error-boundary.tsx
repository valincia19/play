/* eslint-disable react-refresh/only-export-components -- Exports class boundary + HOC + hook as unified error handling API */
import React, { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { RiAlertLine, RiRefreshLine, RiHomeLine } from '@remixicon/react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  isolate?: boolean // If true, errors don't bubble to parent boundaries
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * With custom fallback:
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * With error callback:
 * <ErrorBoundary
 *   onError={(error, errorInfo) => {
 *     logToErrorService(error, errorInfo)
 *   }}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: crypto.randomUUID?.() || Math.random().toString(36).substring(7)
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorId: crypto.randomUUID?.() || Math.random().toString(36).substring(7)
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to monitoring service
    const { errorId } = this.state

    console.error('[ErrorBoundary] Caught error:', {
      errorId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack: errorInfo.componentStack,
      // digest: errorInfo.digest // Property doesn't exist on ErrorInfo
    })

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo)

    // Update state with error info
    this.setState({
      errorInfo
    })

    // Log to error tracking service (if implemented)
    this.logToErrorService(error, errorInfo)
  }

  private logToErrorService(error: Error, errorInfo: ErrorInfo): void {
    // Placeholder for error tracking integration
    // TODO: Integrate with Sentry, Rollbar, or similar service
    try {
      // Example Sentry integration:
      // Sentry.captureException(error, {
      //   contexts: {
      //     react: {
      //       componentStack: errorInfo.componentStack
      //     }
      //   },
      //   tags: {
      //     errorBoundary: 'true',
      //     errorId: this.state.errorId
      //   }
      // })

      // For now, log to console with structured format
      console.error('[ErrorTracking]', {
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href
      })
    } catch (loggingError) {
      console.error('[ErrorBoundary] Failed to log error:', loggingError)
    }
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: crypto.randomUUID?.() || Math.random().toString(36).substring(7)
    })
  }

  private handleGoHome = (): void => {
    window.location.href = '/'
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { hasError, error, errorId } = this.state
    const { children, fallback } = this.props

    if (!hasError) {
      return children
    }

    // Use custom fallback if provided
    if (fallback) {
      return fallback
    }

    // Default error UI
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <RiAlertLine className="h-6 w-6 text-destructive" />
              <CardTitle className="text-xl">Something went wrong</CardTitle>
            </div>
            <CardDescription>
              An unexpected error occurred. The error has been logged and we'll look into it.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-mono text-muted-foreground">
                  {error.message}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Error ID: {errorId}
                </p>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && error?.stack && (
              <details className="rounded-lg bg-muted p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Stack Trace (Development)
                </summary>
                <pre className="mt-2 text-xs overflow-auto max-h-48">
                  {error.stack}
                </pre>
              </details>
            )}
          </CardContent>

          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={this.handleReset}
              className="flex-1"
            >
              <RiRefreshLine className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <Button
              variant="default"
              onClick={this.handleGoHome}
              className="flex-1"
            >
              <RiHomeLine className="h-4 w-4 mr-2" />
              Go Home
            </Button>
          </CardFooter>

          <div className="px-6 pb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={this.handleReload}
              className="w-full"
            >
              Reload Page
            </Button>
          </div>
        </Card>
      </div>
    )
  }
}

/**
 * Higher-order component version of ErrorBoundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

/**
 * Hook for error boundary integration with functional components
 */
export function useErrorHandler(): (error: Error) => void {
  return React.useCallback((error: Error) => {
    throw error
  }, [])
}