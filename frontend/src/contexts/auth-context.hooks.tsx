/* eslint-disable react-refresh/only-export-components -- AuthProvider + useAuth are co-exported as a unified context API */
import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { api, getAccessToken, type UserProfile } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────

export interface AuthContextType {
  user: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  refreshUser: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

// ─── Hook Function ───────────────────────────────────────────

function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// ─── Provider Component ───────────────────────────────────────

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const token = getAccessToken()
    if (!token) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const profile = await api.getMe()
      setUser(profile)
    } catch {
      api.logout()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    api.logout()
    setUser(null)
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const value = useMemo(() => ({
    user,
    isLoading,
    isAuthenticated: !!user,
    refreshUser,
    logout,
  }), [user, isLoading, refreshUser, logout])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Export types and hook separately to avoid react-refresh warning
export type { AuthContextType }

// Export the hook and provider
export { AuthProvider, useAuth }
