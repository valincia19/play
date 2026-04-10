import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RiUserStarFill, RiDatabase2Fill, RiGlobalLine, RiVideoFill, RiMoneyDollarCircleFill } from "@remixicon/react"
import { adminApi } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import type { AdminStats } from "@/lib/types"

export function Studio() {
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
    colorClass = "text-muted-foreground"
  }: {
    title: string
    value: string | number
    icon: typeof RiUserStarFill
    detail: string
    colorClass?: string
  }) => (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`size-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">{detail}</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Studio</h1>
        <p className="text-sm text-muted-foreground">
          Welcome to the control center. Monitor system health and global metrics in real-time.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Total Users" 
          value={stats?.totalUsers || 0} 
          icon={RiUserStarFill} 
          detail="Platform registrants"
          colorClass="text-blue-500"
        />
        
        <StatCard 
          title="Global Videos" 
          value={stats?.totalVideos || 0} 
          icon={RiVideoFill} 
          detail="Total hosted media"
          colorClass="text-orange-500"
        />

        <StatCard 
          title="Total Views" 
          value={stats?.totalViews?.toLocaleString() || 0} 
          icon={RiGlobalLine} 
          detail="Across all creators"
          colorClass="text-purple-500"
        />

        <StatCard 
          title="Transactions" 
          value={stats?.totalTransactions || 0} 
          icon={RiMoneyDollarCircleFill} 
          detail="SaaS revenue events"
          colorClass="text-green-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Database Cluster</CardTitle>
            <RiDatabase2Fill className="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Operational</div>
            <p className="text-xs text-muted-foreground mt-1">Redis & PostgreSQL Healthy</p>
          </CardContent>
        </Card>
        
        <Card className="flex flex-col bg-primary/[0.03] border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Worker Status</CardTitle>
            <div className="flex gap-1.5 items-center">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-[10px] font-bold text-green-600 uppercase">Live</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Background Engine</div>
            <p className="text-xs text-muted-foreground mt-1">Processing views, queue jobs, and scheduled tasks.</p>
            <Link to="/studio/worker-monitor" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">
              Open worker monitor
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
