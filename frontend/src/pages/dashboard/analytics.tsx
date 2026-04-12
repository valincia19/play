import { useEffect, useState, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  RiEyeLine,
  RiAdvertisementLine,
  RiGroupLine,
  RiCompass3Line, 
  RiDownloadCloud2Line, 
  RiHardDrive2Line,
  RiCalendarLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
  RiFocus2Line,
  RiPieChart2Line,
  RiBarChartGroupedLine,
  RiErrorWarningLine
} from "@remixicon/react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line, Bar } from 'recharts'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { format, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { formatBytes } from "@/lib/utils"

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];



interface AnalyticsOverview {
  totalViews: number
  totalAdImpressions: number
  totalUniqueSessions: number
  totalStorage: number
  totalBandwidth: number
}

interface ViewsDaily {
  date: string
  views: number
  uniques: number
}

interface RetentionData {
  completionRate: number
  avgWatchDuration: number
}

interface AudienceEntry {
  device?: string
  browser?: string
  country?: string
  count: number
}

interface AudienceData {
  devices: AudienceEntry[]
  browsers: AudienceEntry[]
  countries: AudienceEntry[]
}

interface AdDailyEntry {
  date: string
  impressions: number
}

interface AdProviderEntry {
  provider: string
  count: string | number
}

interface AdTypeEntry {
  type: string
  count: string | number
}

interface AdsAnalytics {
  daily?: AdDailyEntry[]
  providers?: AdProviderEntry[]
  types?: AdTypeEntry[]
}

interface TopVideo {
  id: string
  title: string
  views: number
  fileSizeBytes: number
}

export function DashboardAnalytics() {
  const [date, setDate] = useState<DateRange | undefined>({
    from: subDays(new Date(), 7),
    to: new Date()
  })
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [viewsData, setViewsData] = useState<ViewsDaily[]>([])
  const [adsData, setAdsData] = useState<AdsAnalytics | null>(null)
  const [topVideos, setTopVideos] = useState<TopVideo[]>([])
  const [retention, setRetention] = useState<RetentionData | null>(null)
  const [audience, setAudience] = useState<AudienceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [ecpm, setEcpm] = useState<number>(1.50)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const fromStr = date?.from ? format(date.from, 'yyyy-MM-dd') : ''
        const toStr = date?.to ? format(date.to, 'yyyy-MM-dd') : ''
        const dateQuery = fromStr ? `?from=${fromStr}&to=${toStr}` : ''

        const [ov, vw, ad, vd] = await Promise.all([
          api.get<AnalyticsOverview>(`/analytics/overview${dateQuery}`),
          api.get<{ daily?: ViewsDaily[]; retention?: RetentionData; devices?: AudienceEntry[]; browsers?: AudienceEntry[]; countries?: AudienceEntry[] }>(`/analytics/views${dateQuery}`),
          api.get<AdsAnalytics>(`/analytics/ads${dateQuery}`),
          api.get<TopVideo[]>(`/analytics/videos${dateQuery}`)
        ])
        setOverview(ov)
        setViewsData(vw?.daily || (Array.isArray(vw) ? vw : []))
        setRetention(vw?.retention || null)
        setAudience({ devices: vw?.devices || [], browsers: vw?.browsers || [], countries: vw?.countries || [] })
        setAdsData(ad)
        setTopVideos(Array.isArray(vd) ? vd : [])
      } catch (e) {
        console.error("Failed to load analytics", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [date])

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-[200px]" />
            <Skeleton className="h-4 w-[300px]" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-[120px] rounded-lg" />
            <Skeleton className="h-10 w-[80px] rounded-lg" />
            <Skeleton className="h-10 w-[200px] rounded-lg" />
          </div>
        </div>

        {/* 10 Stat Cards Skeleton (grid grid-cols-2 md:grid-cols-5) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={`stat-${i}`} className="h-[96px] sm:h-[110px] w-full rounded-xl" />
          ))}
        </div>

        {/* 2 Main Charts Skeleton */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[380px] w-full rounded-xl" />
          <Skeleton className="h-[380px] w-full rounded-xl" />
        </div>

        {/* 3 Analytics Cards Skeleton */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[320px] w-full rounded-xl" />
          <Skeleton className="h-[320px] w-full rounded-xl" />
          <Skeleton className="h-[320px] w-full rounded-xl" />
        </div>

        {/* Top Videos Table Skeleton */}
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Insights across your video library and ad performances.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0">
          {/* Default eCPM Configurator */}
          <div className="flex items-center gap-2 bg-muted/40 p-1 px-3 rounded-lg border border-border/50 h-9 sm:h-10">
            <span className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest">eCPM ($)</span>
            <input 
              type="number" 
              step="0.1" 
              value={ecpm} 
              onChange={e => setEcpm(Number(e.target.value))} 
              className="w-10 sm:w-12 h-6 bg-transparent border-b border-border/50 text-[11px] sm:text-xs font-bold text-center focus:outline-none focus:border-primary/50 transition-colors" 
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50">
            {[7, 30].map(d => (
              <Button
                key={d}
                variant="ghost"
                size="sm"
                onClick={() => setDate({ from: subDays(new Date(), d), to: new Date() })}
                className="px-3 sm:px-4 h-7 sm:h-8 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all hover:bg-background shadow-sm"
              >
                {d} Days
              </Button>
            ))}
          </div>
          
          {/* Calendar Date Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 sm:h-10 border-border/50 bg-muted/40 font-medium text-xs">
                <RiCalendarLine className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "MMM dd, y")} - {format(date.to, "MMM dd, y")}
                    </>
                  ) : (
                    format(date.from, "MMM dd, y")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end" sideOffset={8}>
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-md"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Anomaly Alerts System */}
      {(() => {
        const monRate = overview?.totalUniqueSessions ? overview.totalAdImpressions / overview.totalUniqueSessions : 0;
        const compRate = retention?.completionRate || 0;

        if ((overview?.totalViews || 0) > 100 && (monRate < 0.5 || compRate < 10)) {
          return (
            <Alert variant="destructive" className="bg-rose-500/10 text-rose-600 border-rose-500/20">
              <RiErrorWarningLine className="size-4" />
              <AlertTitle>Traffic Quality Alert</AlertTitle>
              <AlertDescription>
                  {monRate < 0.5 && "Monetization rate is unusually low (< 0.5 ads/viewer). Check ad scripts or bot traffic. "}
                  {compRate < 10 && "Video completion rate is critical (< 10%). High bounce likely."}
              </AlertDescription>
            </Alert>
          )
        }
        return null;
      })()}

      {/* Overview Cards (Merged into one grid to prevent single-row dangling item on mobile) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <StatCard title="Total Views" value={overview?.totalViews?.toLocaleString() || 0} icon={<RiEyeLine />} />
        <StatCard title="Ad Impressions" value={overview?.totalAdImpressions?.toLocaleString() || 0} icon={<RiAdvertisementLine />} />
        <StatCard title="Unique Viewers" value={overview?.totalUniqueSessions?.toLocaleString() || 0} icon={<RiGroupLine />} />
        <StatCard 
          title="Monetization Rate" 
          value={overview?.totalUniqueSessions ? (overview.totalAdImpressions / overview.totalUniqueSessions).toFixed(2) : "0"} 
          icon={<RiMoneyDollarCircleLine />} 
          trend={<span className="text-muted-foreground">Ads/Viewer</span>}
        />
        <StatCard 
          title="Est Revenue" 
          value={`$${((overview?.totalAdImpressions || 0) * ecpm / 1000).toFixed(2)}`} 
          icon={<RiMoneyDollarCircleLine />} 
          trend={<span className="text-muted-foreground text-[10px]">@ ${ecpm} eCPM</span>}
        />

        {(() => {
          const compRate = retention?.completionRate || 0;
          const monRate = overview?.totalUniqueSessions ? overview.totalAdImpressions / overview.totalUniqueSessions : 0;
          const avgDuration = retention?.avgWatchDuration || 0;

          // Quality Score Formula: 0-100 Scale
          const watchScore = Math.min((avgDuration / 60) * 40, 40);
          const compScore = (compRate / 100) * 40;
          const adScore = Math.min(monRate * 20, 20);
          const penalty = (compRate < 10 && monRate < 0.2) ? -20 : 0;
          const finalScore = Math.max(0, Math.min(100, Math.round(watchScore + compScore + adScore + penalty)));

          let trendText = "Moderate";
          let trendColor = "text-amber-500";
          if (finalScore >= 75) { trendText = "High Quality"; trendColor = "text-emerald-500"; }
          else if (finalScore < 40) { trendText = "Low Quality"; trendColor = "text-rose-500"; }

          return (
            <StatCard 
              title="Traffic Quality" 
              value={`${finalScore}`} 
              icon={<RiFocus2Line />} 
              trend={<span className={trendColor}>{trendText}</span>} 
            />
          )
        })()}
        
        <StatCard title="Avg Watch Time" value={formatTime(retention?.avgWatchDuration || 0)} icon={<RiTimeLine />} />
        <StatCard title="Completion Rate" value={`${(retention?.completionRate || 0).toFixed(1)}%`} icon={<RiFocus2Line />} />
        <StatCard title="Storage" value={formatBytes(overview?.totalStorage || 0)} icon={<RiHardDrive2Line />} />
        <StatCard title="Est. Bandwidth" value={formatBytes(overview?.totalBandwidth || 0)} icon={<RiDownloadCloud2Line />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Main Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RiCompass3Line className="size-4" /> Views Over Time
            </CardTitle>
            <CardDescription>Daily view count and unique visitors.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={viewsData}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#374151' }}
                />
                <Area type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorViews)" />
                <Area type="monotone" dataKey="uniques" stroke="#10b981" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Ad Trends & Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RiBarChartGroupedLine className="size-4" /> Daily Ad Trends & Revenue
            </CardTitle>
            <CardDescription>Impressions correlated with estimated revenue.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={adsData?.daily?.map((d: AdDailyEntry) => ({ ...d, revenue: (d.impressions * ecpm / 1000).toFixed(2) })) || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#10b981' }} tickFormatter={v => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  itemStyle={{ color: '#374151' }}
                  cursor={{fill: '#f3f4f6'}}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="impressions" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Ad Impressions" />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} name="Est. Revenue ($)" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Ad Providers Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RiPieChart2Line className="size-4" /> Ad Providers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={adsData?.providers?.map((p: AdProviderEntry) => ({ name: p.provider || 'Others', value: Number(p.count) })) || []}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {adsData?.providers?.map((_: AdProviderEntry, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-4 w-full px-4 mt-4">
              {adsData?.providers?.map((p: AdProviderEntry, i: number) => (
                <div key={p.provider} className="flex items-center gap-2">
                  <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-medium capitalize truncate">{p.provider || 'Others'}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{((Number(p.count)/(overview?.totalAdImpressions || 1))*100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Ad Types Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RiAdvertisementLine className="size-4" /> Ad Formats
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={adsData?.types?.map((p: AdTypeEntry) => ({ name: (p.type || 'Unknown').replace(/_/g, ' '), value: Number(p.count) })) || []}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {adsData?.types?.map((_: AdTypeEntry, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-4 w-full px-4 mt-4">
              {adsData?.types?.map((p: AdTypeEntry, i: number) => (
                <div key={p.type} className="flex items-center gap-2">
                  <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + 2) % COLORS.length] }} />
                  <span className="text-xs font-medium capitalize truncate">{(p.type || 'Unknown').replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Audience Devices */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <RiGroupLine className="size-4" /> Audience Context
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Top Devices</h4>
                {audience?.devices?.map((p: AudienceEntry) => (
                  <div key={p.device} className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{p.device || 'Unknown'}</span>
                    <span className="text-sm font-bold">{p.count} views</span>
                  </div>
                ))}
              </div>
              <div className="w-full h-[1px] bg-border/50" />
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Top Browsers</h4>
                {audience?.browsers?.slice(0, 3).map((p: AudienceEntry) => (
                  <div key={p.browser} className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{p.browser || 'Unknown'}</span>
                    <span className="text-sm font-bold">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Videos Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Most Viewed Content</CardTitle>
            <CardDescription className="text-xs mt-1">Top videos ranked by performance.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-muted-foreground text-[10px] sm:text-xs font-bold uppercase tracking-wider border-y border-border/40">
                  <th className="text-left py-3 px-4 whitespace-nowrap">Video Title</th>
                  <th className="text-right py-3 px-4 whitespace-nowrap">Views</th>
                  <th className="text-right py-3 px-4 whitespace-nowrap">Storage</th>
                  <th className="text-right py-3 px-4 whitespace-nowrap">Est. Bandwidth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {topVideos?.slice(0, 7).map(video => (
                  <tr key={video.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="py-3 sm:py-4 px-4 font-medium max-w-[140px] sm:max-w-[300px]">
                      <div className="truncate text-[13px] sm:text-sm group-hover:text-primary transition-colors">{video.title || "Untitled Video"}</div>
                    </td>
                    <td className="py-3 sm:py-4 px-4 text-right font-mono text-[11px] sm:text-xs">{video.views?.toLocaleString() || 0}</td>
                    <td className="py-3 sm:py-4 px-4 text-right text-[11px] sm:text-xs text-muted-foreground">{formatBytes(video.fileSizeBytes)}</td>
                    <td className="py-3 sm:py-4 px-4 text-right">
                      <span className="text-[10px] sm:text-xs bg-primary/10 text-primary px-2 sm:px-2.5 py-1 rounded-md font-bold tracking-wide">
                        {formatBytes((video.views || 0) * (video.fileSizeBytes || 0) * 0.7)}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!topVideos || topVideos.length === 0) && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                      No video data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ title, value, icon, trend }: { title: string, value: string | number, icon: ReactNode, trend?: ReactNode }) {
  return (
    <Card className="hover:border-primary/20 transition-all shadow-sm py-3 sm:py-4 gap-1 sm:gap-1.5 justify-start">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 px-4 sm:px-5">
        <CardTitle className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1 pr-2">{title}</CardTitle>
        <div className="size-7 sm:size-8 rounded-[8px] bg-primary/10 flex items-center justify-center text-primary shrink-0 [&>svg]:size-3.5 sm:[&>svg]:size-4">
          {icon}
        </div>
      </CardHeader>
      <CardContent className="p-0 px-4 sm:px-5">
        <div className="text-xl sm:text-2xl font-bold truncate tracking-tight">{value}</div>
        {trend && (
          typeof trend === 'string' ? (
            <p className={`text-[10px] sm:text-[11px] flex items-center gap-1 mt-1 ${trend.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'} font-medium`}>
              {trend.startsWith('+') ? '▲' : '▼'} {trend.replace(/^[+-]\s*/, '')} <span className="hidden xl:inline text-muted-foreground/60 font-normal">from last month</span>
            </p>
          ) : (
            <div className="text-[10px] sm:text-[11px] mt-1 flex items-center font-medium">{trend}</div>
          )
        )}
      </CardContent>
    </Card>
  )
}
