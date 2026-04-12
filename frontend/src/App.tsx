import { useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom"
import { AuthProvider } from "@/contexts/auth-context"
import { ProtectedRoute } from "@/components/auth/protected-route"
import { ErrorBoundary } from "@/components/error-boundary"

import { Home } from "@/pages/home"
import { Login } from "@/pages/login"
import { Register } from "@/pages/register"
import { ForgotPassword } from "@/pages/forgot-password"
import { Verify } from "@/pages/verify"
import { VerifyInfo } from "@/pages/verify-info"
import { ShareVideo } from "@/pages/share/video"
import { ShareFolder } from "@/pages/share/folder"
import { BlogIndex } from "@/pages/blog"
import { BlogPostPage } from "@/pages/blog/post"
import { NotFound } from "@/pages/not-found"
import { PrivacyPolicy } from "@/pages/privacy"
import { TermsOfService } from "@/pages/terms"

import { DashboardLayout } from "@/layouts/dashboard-layout"
import { DashboardIndex } from "@/pages/dashboard/index"
import { DashboardVideos } from "@/pages/dashboard/videos"
import { DashboardVideosUpload } from "@/pages/dashboard/videos-upload"
import { DashboardAds } from "@/pages/dashboard/ads"
import { DashboardAnalytics } from "@/pages/dashboard/analytics"
import { DashboardSettings } from "@/pages/dashboard/settings"
import { DashboardBilling } from "@/pages/dashboard/billing"

import { StudioLayout } from "@/layouts/studio-layout"
import { Studio } from "@/pages/studio/index"
import { StudioUsers } from "@/pages/studio/users"
import { StudioPlans } from "@/pages/studio/plans"
import { StudioTransactions } from "@/pages/studio/transactions"
import { AdminStorage } from "@/pages/studio/storage"
import { StudioWorkerMonitor } from "@/pages/studio/worker-monitor"
import { StudioBlog } from "@/pages/studio/blog"
import { StudioDomains } from "@/pages/studio/domains"

function DomainRedirector() {
  const location = useLocation()

  useEffect(() => {
    const hostname = window.location.hostname
    
    // Ambil configurasi domain dari file .env
    const shareDomain = import.meta.env.VITE_SHARE_DOMAIN
    const mainDomain = import.meta.env.VITE_MAIN_DOMAIN
    
    if (!shareDomain || !mainDomain) return

    // Cek domain mana yang sedang diakses
    const isShareDomain = hostname === shareDomain || hostname === `www.${shareDomain}`
    const isMainDomain = hostname === mainDomain || hostname === `www.${mainDomain}`
    
    // Izinkan path untuk video, folder, API proxy (/v/), stream, atau preview
    const validSharePaths = ['/d/', '/f/', '/v/']
    const isSharePath = validSharePaths.some(p => location.pathname.startsWith(p))
    
    const protocol = window.location.protocol

    if (isShareDomain && !isSharePath) {
      // 1. Jika di domain verply.net TAPI mengakses selain share link (misal /dashboard) 
      // -> Tendang user ke vercelplay.com/dashboard
      const redirectPath = location.pathname === '/' ? '' : location.pathname
      window.location.replace(`${protocol}//${mainDomain}${redirectPath}${location.search}`)
    } else if (isMainDomain && isSharePath) {
      // 2. Jika di domain vercelplay.com TAPI mengakses share link (/d/, /f/) 
      // -> Tendang user ke verply.net/d/...
      window.location.replace(`${protocol}//${shareDomain}${location.pathname}${location.search}`)
    }
  }, [location.pathname, location.search])

  return null
}

export function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Log to error tracking service
        console.error('[RootErrorBoundary]', {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          componentStack: errorInfo.componentStack
        })
      }}
    >
      <Router>
        <DomainRedirector />
        <AuthProvider>
        <Routes>
          {/* Public Share Routes */}
          <Route path="/d/:id" element={<ShareVideo />} />
          <Route path="/f/:id" element={<ShareFolder />} />

          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/blog" element={<BlogIndex />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/verify-info" element={<VerifyInfo />} />

          {/* Protected Dashboard Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardIndex />} />
            <Route path="videos" element={<DashboardVideos />} />
            <Route path="videos/upload" element={<DashboardVideosUpload />} />
            <Route path="ads" element={<DashboardAds />} />
            <Route path="analytics" element={<DashboardAnalytics />} />
            <Route path="billing" element={<DashboardBilling />} />
            <Route path="settings" element={<DashboardSettings />} />
          </Route>

          {/* Protected Admin Studio Routes */}
          <Route
            path="/studio"
            element={
              <ProtectedRoute>
                <StudioLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Studio />} />
            <Route path="users" element={<StudioUsers />} />
            <Route path="plans" element={<StudioPlans />} />
            <Route path="transactions" element={<StudioTransactions />} />
            <Route path="storage" element={<AdminStorage />} />
            <Route path="worker-monitor" element={<StudioWorkerMonitor />} />
            <Route path="blog" element={<StudioBlog />} />
            <Route path="domains" element={<StudioDomains />} />
          </Route>

          {/* Fallback 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </Router>
    </ErrorBoundary>
  )
}

export default App
