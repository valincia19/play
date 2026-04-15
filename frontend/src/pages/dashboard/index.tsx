import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api, videoApi, API_BASE_URL } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import {
  RiEyeLine,
  RiDatabase2Line,
  RiWifiLine,
  RiFilmLine,
  RiUploadCloud2Line,
  RiAdvertisementLine,
  RiBarChartBoxLine,
  RiFolder3Line,
  RiTimeLine,
  RiPlayCircleLine,
  RiLoader4Line
} from "@remixicon/react"
import { formatDistanceToNow } from "date-fns"
import { formatBytes, formatNumber } from "@/lib/utils"

interface DashboardOverview {
  totalViews: number
  totalVideos: number
  totalBandwidth: number
  totalStorage: number
}

interface DashboardVideo {
  id: string
  title: string
  status: string
  views: number
  thumbnailPath?: string
  createdAt: string
}

export function DashboardIndex() {
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [recentVideos, setRecentVideos] = useState<DashboardVideo[]>([])
  const [bwUsage, setBwUsage] = useState<{ usedMB: number; maxMB: number; percent: number; isUnlimited: boolean } | null>(null)
  const [storageUsage, setStorageUsage] = useState<{ usedMB: number; maxMB: number; percent: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function load() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [overviewRes, topVideosRes, bwRes, storageRes] = await Promise.all([
          api.get('/analytics/overview').catch(() => null),
          api.get(`/analytics/videos?from=${today}`).catch(() => []),
          videoApi.getBandwidthUsage().catch(() => null),
          videoApi.getStorageUsage().catch(() => null),
        ])
        setData(overviewRes as DashboardOverview | null)
        setRecentVideos((topVideosRes as any) || [])

        if (bwRes) setBwUsage(bwRes)
        if (storageRes) {
          const maxMB = storageRes.maxMB === -1 ? -1 : storageRes.maxMB
          setStorageUsage({
            usedMB: storageRes.usedMB,
            maxMB,
            percent: maxMB === -1 ? 0 : Math.min(Math.round((storageRes.usedMB / maxMB) * 100), 100),
          })
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Overview</h1>
        <p className="text-sm text-muted-foreground">
          Quick summary of your video performance and resource usage.
        </p>
      </div>
      
      {/* Top Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        
        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <RiEyeLine className="size-4 text-primary opacity-80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(data?.totalViews || 0)}</div>
            <p className="text-xs text-muted-foreground pt-1">Across all content</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Videos</CardTitle>
            <RiFilmLine className="size-4 text-primary opacity-80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalVideos || 0}</div>
            <p className="text-xs text-muted-foreground pt-1">Uploaded library</p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth (Weekly)</CardTitle>
            <RiWifiLine className="size-4 text-primary opacity-80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {bwUsage ? formatBytes(bwUsage.usedMB * 1024 * 1024) : formatBytes(data?.totalBandwidth || 0)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {bwUsage && !bwUsage.isUnlimited && (
                <div className="h-1.5 flex-1 max-w-[120px] overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${bwUsage.percent > 90 ? 'bg-red-500' : bwUsage.percent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${bwUsage.percent}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {bwUsage?.isUnlimited ? 'Unlimited' : bwUsage ? `of ${formatBytes(bwUsage.maxMB * 1024 * 1024)}` : 'This billing cycle'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <RiDatabase2Line className="size-4 text-primary opacity-80" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {storageUsage ? formatBytes(storageUsage.usedMB * 1024 * 1024) : formatBytes(data?.totalStorage || 0)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {storageUsage && storageUsage.maxMB !== -1 && (
                <div className="h-1.5 flex-1 max-w-[120px] overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full transition-all ${storageUsage.percent > 90 ? 'bg-red-500' : storageUsage.percent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                    style={{ width: `${storageUsage.percent}%` }}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {storageUsage?.maxMB === -1 ? 'Unlimited' : storageUsage ? `of ${formatBytes(storageUsage.maxMB * 1024 * 1024)}` : 'Total disk space'}
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Main Grid Area */}
      <div className="grid gap-6 md:grid-cols-3">
        
        {/* Left Col (2/3): Recent Activity */}
        <Card className="md:col-span-2 border-border shadow-sm flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Daily Video Viewer</CardTitle>
              <CardDescription>Your most viewed videos across the platform.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/videos')}>
              View All
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            {recentVideos.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
                <RiFolder3Line className="size-8 text-muted-foreground mb-3" />
                <h3 className="font-medium text-sm">No recent videos</h3>
                <p className="text-xs text-muted-foreground text-center mt-1 mb-4">
                  Upload your first video to start analyzing performance.
                </p>
                <Button size="sm" onClick={() => navigate('/dashboard/videos/upload')}>
                  <RiUploadCloud2Line className="mr-2 size-4" /> Upload Now
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentVideos.map((video) => (
                  <div key={video.id} className="flex items-center gap-4 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="relative size-12 rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border/40">
                      {video.thumbnailPath ? (
                        <img 
                          src={`${API_BASE_URL}/v/${video.id}/thumbnail`} 
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : video.status === 'ready' ? (
                        <RiPlayCircleLine className="size-6 text-primary" />
                      ) : (
                        <RiLoader4Line className="size-6 text-muted-foreground animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors" title={video.title}>
                        {video.title}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground/80 font-medium">
                        <span className="flex items-center gap-1.5 py-0.5 px-2 rounded-full bg-primary/5 text-primary border border-primary/10">
                          <RiEyeLine className="size-3" />
                          {formatNumber(video.views)} views
                        </span>
                        <span className="flex items-center gap-1">
                          <RiTimeLine className="size-3" />
                          {formatDistanceToNow(new Date(video.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${
                        video.status === 'ready' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        video.status === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        {video.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Col (1/3): Quick Actions */}
        <div className="space-y-6 flex flex-col">
          <Card className="border-border shadow-sm flex-1">
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
              <CardDescription>Shortcut to vital tools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/dashboard/videos/upload')}>
                <RiUploadCloud2Line className="mr-2 size-4 text-primary" /> Upload New Video
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/dashboard/ads')}>
                <RiAdvertisementLine className="mr-2 size-4 text-purple-500" /> Manage Ads Toolkit
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/dashboard/analytics')}>
                <RiBarChartBoxLine className="mr-2 size-4 text-blue-500" /> View Analytics Map
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => navigate('/dashboard/videos')}>
                <RiFolder3Line className="mr-2 size-4 text-amber-500" /> Browse Library
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-primary/5 border-primary/20">
            <CardContent className="p-6 text-center space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center mb-1">
                <RiDatabase2Line className="size-5 text-primary" />
              </div>
              <h3 className="font-semibold text-sm text-primary">Need more power?</h3>
              <p className="text-xs text-muted-foreground">
                Get unlimited bandwidth, DRM features, and Ultra HD processing line.
              </p>
              <Link to="/dashboard/billing" className="inline-block mt-3 text-xs font-bold uppercase tracking-wider text-primary hover:underline">
                View Plans & Upgrade
              </Link>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
