import { useEffect, useState } from "react"
import { toast } from "sonner"
import { adminApi } from "@/lib/api"
import type { WorkerMonitorSnapshot } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  RiAlarmWarningLine,
  RiCheckLine,
  RiCpuLine,
  RiLoader4Line,
  RiRefreshLine,
  RiServerLine,
  RiStackLine,
  RiTimeLine,
  RiDeleteBinLine
} from "@remixicon/react"

function formatTime(value?: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString()
}

function formatDuration(seconds?: number) {
  if (!seconds && seconds !== 0) return "-"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

export function StudioWorkerMonitor() {
  const [snapshot, setSnapshot] = useState<WorkerMonitorSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)

  const handleCleanup = async () => {
    if (!confirm("Are you sure you want to scan and delete orphaned files from all S3 buckets? This cannot be undone.")) return
    
    setIsCleaning(true)
    const tId = toast.loading("Scanning S3 buckets for orphans...")
    try {
      const res = await adminApi.cleanupStorage()
      toast.success(`Success! Deleted ${res.deletedItems} items, freeing ${res.mbFreed} MB.`, { id: tId })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cleanup storage orphans", { id: tId })
    } finally {
      setIsCleaning(false)
    }
  }

  const loadMonitor = async (background = false) => {
    if (background) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const data = await adminApi.getWorkerMonitor()
      setSnapshot(data)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    loadMonitor()
    const interval = window.setInterval(() => loadMonitor(true), 10000)
    return () => window.clearInterval(interval)
  }, [])

  const statCards = [
    {
      title: "Worker Heartbeat",
      value: snapshot?.worker.isOnline ? "Online" : "Offline",
      detail: snapshot?.worker.lastSeenAt ? `Last seen ${formatTime(snapshot.worker.lastSeenAt)}` : "No heartbeat received yet",
      icon: RiServerLine,
      tone: snapshot?.worker.isOnline ? "text-emerald-500" : "text-destructive",
    },
    {
      title: "Queue Active",
      value: snapshot?.queue.active ?? 0,
      detail: `${snapshot?.queue.waiting ?? 0} waiting, ${snapshot?.queue.delayed ?? 0} delayed`,
      icon: RiLoader4Line,
      tone: "text-sky-500",
    },
    {
      title: "Processing Videos",
      value: snapshot?.videos.byStatus.processing ?? 0,
      detail: `${snapshot?.videos.byStatus.pending ?? 0} pending, ${snapshot?.videos.byStatus.error ?? 0} error`,
      icon: RiStackLine,
      tone: "text-amber-500",
    },
    {
      title: "Worker Memory",
      value: snapshot?.worker.memoryMb ? `${snapshot.worker.memoryMb} MB` : "-",
      detail: `Uptime ${formatDuration(snapshot?.worker.uptimeSec)}`,
      icon: RiCpuLine,
      tone: "text-violet-500",
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Worker Monitor</h1>
          <p className="text-sm text-muted-foreground">
            Monitor worker heartbeat, BullMQ queue status, and recently processed or failed videos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={snapshot?.worker.isOnline ? "default" : "destructive"} className="px-3 py-1">
            {snapshot?.worker.isOnline ? "Worker Online" : "Worker Offline"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => loadMonitor(true)} disabled={isRefreshing || isCleaning}>
            <RiRefreshLine className={`mr-2 size-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={handleCleanup} disabled={isCleaning}>
            <RiDeleteBinLine className={`mr-2 size-4 ${isCleaning ? "animate-pulse" : ""}`} />
            {isCleaning ? "Cleaning..." : "Cleanup S3 Orphans"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
              <card.icon className={`size-4 ${card.tone}`} />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{card.value}</div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Runtime Snapshot</CardTitle>
          <CardDescription>
            Last snapshot generated at {snapshot ? formatTime(snapshot.generatedAt) : "-"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <RiTimeLine className="size-4 text-muted-foreground" />
              Worker Details
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>PID: <span className="font-medium text-foreground">{snapshot?.worker.pid ?? "-"}</span></p>
              <p>Started: <span className="font-medium text-foreground">{formatTime(snapshot?.worker.startedAt)}</span></p>
              <p>Last Seen: <span className="font-medium text-foreground">{formatTime(snapshot?.worker.lastSeenAt)}</span></p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <RiStackLine className="size-4 text-muted-foreground" />
              Queue State
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-muted-foreground">Waiting: <span className="font-medium text-foreground">{snapshot?.queue.waiting ?? 0}</span></p>
              <p className="text-muted-foreground">Active: <span className="font-medium text-foreground">{snapshot?.queue.active ?? 0}</span></p>
              <p className="text-muted-foreground">Delayed: <span className="font-medium text-foreground">{snapshot?.queue.delayed ?? 0}</span></p>
              <p className="text-muted-foreground">Failed: <span className="font-medium text-foreground">{snapshot?.queue.failed ?? 0}</span></p>
              <p className="text-muted-foreground">Completed: <span className="font-medium text-foreground">{snapshot?.queue.completed ?? 0}</span></p>
              <p className="text-muted-foreground">Paused: <span className="font-medium text-foreground">{snapshot?.queue.paused ?? 0}</span></p>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <RiCheckLine className="size-4 text-muted-foreground" />
              Video States
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-muted-foreground">Pending: <span className="font-medium text-foreground">{snapshot?.videos.byStatus.pending ?? 0}</span></p>
              <p className="text-muted-foreground">Processing: <span className="font-medium text-foreground">{snapshot?.videos.byStatus.processing ?? 0}</span></p>
              <p className="text-muted-foreground">Ready: <span className="font-medium text-foreground">{snapshot?.videos.byStatus.ready ?? 0}</span></p>
              <p className="text-muted-foreground">Error: <span className="font-medium text-foreground">{snapshot?.videos.byStatus.error ?? 0}</span></p>
              <p className="text-muted-foreground">Uploading: <span className="font-medium text-foreground">{snapshot?.videos.byStatus.uploading ?? 0}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="videos" className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="videos">Recent Videos</TabsTrigger>
          <TabsTrigger value="failed">Failed Jobs</TabsTrigger>
          <TabsTrigger value="active">Active Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="videos">
          <Card>
            <CardHeader>
              <CardTitle>Recent Video Processing</CardTitle>
              <CardDescription>Latest status of recently updated videos.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Video</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot?.videos.recent.length ? snapshot.videos.recent.map((video) => (
                    <TableRow key={video.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{video.title}</div>
                          <div className="text-xs text-muted-foreground font-mono">{video.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={video.status === "error" ? "destructive" : "secondary"}>{video.status}</Badge>
                      </TableCell>
                      <TableCell>{video.processingMode}</TableCell>
                      <TableCell>{formatTime(video.updatedAt)}</TableCell>
                      <TableCell className="max-w-[340px] truncate text-xs text-muted-foreground">
                        {video.errorMessage || "-"}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No recent video activity.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="failed">
          <Card>
            <CardHeader>
              <CardTitle>Failed Queue Jobs</CardTitle>
              <CardDescription>Recent BullMQ jobs that failed, including error details.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.jobs.failed.length ? snapshot.jobs.failed.map((job) => (
                <div key={job.id} className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{job.id}</div>
                    </div>
                    <Badge variant="destructive">Attempt {job.attemptsMade}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{job.failedReason || "No failure reason recorded"}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Finished: {job.finishedOn ? new Date(job.finishedOn).toLocaleString() : "-"}
                  </p>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No failed jobs in this snapshot.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active Queue Jobs</CardTitle>
              <CardDescription>Jobs currently being processed by the worker.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot?.jobs.active.length ? snapshot.jobs.active.map((job) => (
                <div key={job.id} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{job.id}</div>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <RiLoader4Line className="size-3 animate-spin" />
                      Running
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                    <p>Attempts: {job.attemptsMade}</p>
                    <p>Started: {job.processedOn ? new Date(job.processedOn).toLocaleString() : "-"}</p>
                    <p>Payload: {JSON.stringify(job.data)}</p>
                  </div>
                </div>
              )) : (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No active jobs at the time of this snapshot.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!snapshot?.worker.isOnline && !isLoading ? (
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <RiAlarmWarningLine className="size-5 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Worker heartbeat not detected</p>
              <p className="text-sm text-muted-foreground">
                Make sure the worker process is running and can write heartbeats to Redis.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
