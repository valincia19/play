import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { 
  RiUserStarFill, 
  RiDatabase2Fill, 
  RiGlobalLine, 
  RiVideoFill, 
  RiMoneyDollarCircleFill,
  RiServerLine,
  RiGroupLine,
  RiSettings3Line,
  RiArrowRightUpLine,
  RiBarChartGroupedLine
} from "@remixicon/react"
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { adminApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import type { AdminStats } from "@/lib/types"

export function Studio() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)



  useEffect(() => {
    async function loadStats() {
      try {
        const res = await adminApi.getStats()
        setStats(res)
      } catch (err) {
        console.error("Failed to load studio stats", err)
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [])

  const StatCard = ({
    title,
    value,
    icon: Icon,
    detail,
    colorClass = "text-primary",
    bgClass = "bg-primary/10"
  }: {
    title: string
    value: string | number
    icon: typeof RiUserStarFill
    detail: string
    colorClass?: string
    bgClass?: string
  }) => (
    <Card className="hover:border-primary/20 transition-all shadow-sm py-3 sm:py-4 gap-1 sm:gap-1.5 justify-start flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-0 px-4 sm:px-5">
        <CardTitle className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-muted-foreground line-clamp-1 pr-2">{title}</CardTitle>
        <div className={`size-7 sm:size-8 rounded-[8px] flex items-center justify-center shrink-0 [&>svg]:size-3.5 sm:[&>svg]:size-4 ${bgClass} ${colorClass}`}>
          <Icon />
        </div>
      </CardHeader>
      <CardContent className="p-0 px-4 sm:px-5 mt-1 sm:mt-1.5">
        {isLoading ? (
          <Skeleton className="h-8 w-1/2 mb-1" />
        ) : (
          <div className="text-xl sm:text-2xl font-bold truncate tracking-tight">{value}</div>
        )}
        <div className="text-[10px] sm:text-[11px] mt-1 flex items-center font-medium text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-8 sm:space-y-10 pb-8">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Global command center and real-time infrastructure overview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto mt-2 lg:mt-0">
          <Button variant="outline" className="h-9 sm:h-10 border-border/50 bg-muted/40 font-medium text-xs" onClick={() => navigate('/studio/users')}>
            <RiGroupLine className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" /> Manage Users
          </Button>
          <Button className="h-9 sm:h-10 text-xs font-semibold shadow-md" onClick={() => navigate('/studio/settings')}>
            <RiSettings3Line className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Platform Settings
          </Button>
        </div>
      </div>

      {/* Global Metrics Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Users" 
          value={stats?.totalUsers || 0} 
          icon={RiGroupLine} 
          detail="Platform registrants"
          colorClass="text-blue-500"
          bgClass="bg-blue-500/10 border-blue-500/20"
        />
        
        <StatCard 
          title="Global Videos" 
          value={stats?.totalVideos || 0} 
          icon={RiVideoFill} 
          detail="Total hosted media"
          colorClass="text-orange-500"
          bgClass="bg-orange-500/10 border-orange-500/20"
        />

        <StatCard 
          title="Total Views" 
          value={stats?.totalViews?.toLocaleString() || 0} 
          icon={RiGlobalLine} 
          detail="Across all creators"
          colorClass="text-purple-500"
          bgClass="bg-purple-500/10 border-purple-500/20"
        />

        <StatCard 
          title="Transactions" 
          value={stats?.totalTransactions || 0} 
          icon={RiMoneyDollarCircleFill} 
          detail="SaaS revenue events"
          colorClass="text-emerald-500"
          bgClass="bg-emerald-500/10 border-emerald-500/20"
        />
      </div>

      {/* Global Traffic Chart */}
      <Card className="hover:border-primary/20 transition-all shadow-sm">
        <CardHeader className="border-b border-border/50 py-4 px-5">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <RiBarChartGroupedLine className="size-4" /> Global Traffic & Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-8">
          <div className="h-[280px] w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={stats?.timeseries || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/> /* Emerald */
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorVideos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/> /* Amber */
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} vertical={false} />
                <XAxis dataKey="name" stroke="currentColor" strokeOpacity={0.5} fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" stroke="currentColor" strokeOpacity={0.5} fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="currentColor" strokeOpacity={0.5} fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px', color: '#f4f4f5', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}
                  itemStyle={{ fontSize: '13px', fontWeight: 'bold' }}
                />
                <Area yAxisId="left" type="monotone" dataKey="views" name="Global Views" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorViews)" />
                <Area yAxisId="right" type="monotone" dataKey="users" name="User Registers" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                <Area yAxisId="right" type="monotone" dataKey="videos" name="Video Uploads" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorVideos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12 items-start">
        {/* System Health Section */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex items-center gap-3 px-1">
            <h3 className="text-base font-bold tracking-tight uppercase text-muted-foreground">Infrastructure Health</h3>
          </div>
          
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 min-w-0">
            <Card className="flex flex-col hover:border-primary/20 transition-all shadow-sm">
              <CardHeader className="border-b border-border/50 py-4 px-5 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <RiDatabase2Fill className="size-4" /> Database Cluster
                </CardTitle>
                <div className="flex items-center gap-2 px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10">
                  <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] sm:text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Healthy</span>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="text-lg sm:text-xl font-bold tracking-tight">PostgreSQL & Redis</div>
                <p className="text-xs text-muted-foreground mt-1">Connections are stable. Read/write replicas synchronized. Zero active deadlocks detected.</p>
              </CardContent>
            </Card>
            
            <Card className="flex flex-col hover:border-primary/20 transition-all shadow-sm bg-primary/[0.01]">
              <CardHeader className="border-b border-primary/10 py-4 px-5 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <RiServerLine className="size-4" /> Worker Engine
                </CardTitle>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-blue-500/20 bg-blue-500/10">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-blue-600 uppercase tracking-wider">Processing</span>
                </div>
              </CardHeader>
              <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="text-lg sm:text-xl font-bold tracking-tight">Bg Processes</div>
                  <p className="text-xs text-muted-foreground mt-1">Transcoding queues and analytical aggregations are actively consuming jobs.</p>
                </div>
                <Button variant="outline" size="sm" className="w-full h-9 font-semibold text-xs border-primary/20 bg-primary/5 hover:bg-primary/10" onClick={() => navigate('/studio/worker-monitor')}>
                  Worker Monitor <RiArrowRightUpLine className="ml-1 size-3.5" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions Sidebar */}
        <div className="lg:col-span-4 flex flex-col gap-4 min-w-0">
          <div className="flex items-center gap-3 px-1">
            <h3 className="text-[12px] font-bold tracking-tight uppercase text-muted-foreground">Quick Tools</h3>
          </div>

          <Card className="hover:border-primary/20 transition-all shadow-sm overflow-hidden">
            <div className="flex flex-col">
              <Link to="/studio/users" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors group border-b border-border/50">
                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                  <RiGroupLine className="size-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold tracking-tight">User Management</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Edit profiles & plans</p>
                </div>
                <RiArrowRightUpLine className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </Link>

              <Link to="/studio/domains" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors group border-b border-border/50">
                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                  <RiGlobalLine className="size-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold tracking-tight">Domain Masking</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Manage streaming nodes</p>
                </div>
                <RiArrowRightUpLine className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </Link>
              
              <Link to="/studio/settings" className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors group">
                <div className="p-2 rounded-lg bg-primary/5 text-primary">
                  <RiSettings3Line className="size-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold tracking-tight">System Config</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Global platform settings</p>
                </div>
                <RiArrowRightUpLine className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
