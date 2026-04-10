import { memo, useCallback, useRef, useState } from 'react'
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  RiCheckboxCircleFill,
  RiCloseLine,
  RiErrorWarningFill,
  RiFilmLine,
  RiLoader4Line,
  RiPlayCircleLine,
  RiRestartLine,
  RiUploadCloud2Line,
  RiVidiconLine,
} from "@remixicon/react"
import type { UploadFileItem } from "@/pages/dashboard/videos-upload"

interface UploadQueueProps {
  files: UploadFileItem[]
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<UploadFileItem>) => void
  onRetry?: (id: string) => void
  onCancel?: (id: string) => void
}

const StatusBadge = memo(function StatusBadge({
  status,
  hasServerVideo,
}: {
  status: UploadFileItem['status']
  hasServerVideo: boolean
}) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-border/60 bg-background/80 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {hasServerVideo ? 'Queued' : 'Pending'}
        </Badge>
      )
    case 'uploading':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-sky-500/30 bg-sky-500/5 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-sky-500">
          <RiUploadCloud2Line className="size-3 animate-pulse" />
          Uploading
        </Badge>
      )
    case 'processing':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-amber-500/30 bg-amber-500/5 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-amber-500">
          <RiLoader4Line className="size-3 animate-spin" />
          Processing
        </Badge>
      )
    case 'ready':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-emerald-500/30 bg-emerald-500/5 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-emerald-500">
          <RiCheckboxCircleFill className="size-3" />
          Ready
        </Badge>
      )
    case 'error':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-red-500/30 bg-red-500/5 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-red-500">
          <RiErrorWarningFill className="size-3" />
          Failed
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="outline" className="h-5 gap-1 rounded-full border-border/60 bg-background/80 px-2 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <RiCloseLine className="size-3" />
          Cancelled
        </Badge>
      )
    default:
      return null
  }
})

const ProgressBar = memo(function ProgressBar({ status, progress }: { status: UploadFileItem['status']; progress: number }) {
  if (status === 'ready') {
    return (
      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-emerald-500/20">
        <div className="h-full w-full bg-emerald-500" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-red-500/20">
        <div className="h-full w-full bg-red-500" />
      </div>
    )
  }

  if (status === 'processing') {
    return (
      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-amber-500/10">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-amber-500/60" />
      </div>
    )
  }

  if (status === 'pending' && progress >= 100) {
    return (
      <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-sky-500/10">
        <div className="h-full w-full bg-sky-500/70" />
      </div>
    )
  }

  return (
    <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-xl bg-muted/40">
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
})

const QueueItem = memo(function QueueItem({
  item,
  onRemove,
  onUpdate,
  onRetry,
  onCancel,
}: {
  item: UploadFileItem
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<UploadFileItem>) => void
  onRetry?: (id: string) => void
  onCancel?: (id: string) => void
}) {
  const [localTitle, setLocalTitle] = useState(item.title)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalTitle(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdate(item.id, { title: val })
    }, 400)
  }, [item.id, onUpdate])

  return (
    <Card className="group relative overflow-hidden border border-border/60 bg-card/95 p-2.5 shadow-none transition-colors hover:border-border">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/8 to-transparent" />

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {item.thumbnailUrl ? (
              <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted">
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                {item.status === 'ready' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <RiPlayCircleLine className="size-4 text-white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
                {item.processingMode === 'hls' ? <RiVidiconLine className="size-4" /> : <RiFilmLine className="size-4" />}
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 overflow-hidden">
                <p className="w-0 flex-1 truncate text-[13px] font-medium" title={item.file.name}>{item.file.name}</p>
                <div className="shrink-0">
                  <StatusBadge status={item.status} hasServerVideo={!!item.videoId} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                <span>{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                {item.status === 'uploading' && item.progress > 0 && <span>{item.progress}% uploaded</span>}
                {item.status === 'uploading' && item.uploadSpeed && (
                  <span>{(item.uploadSpeed / (1024 * 1024)).toFixed(1)} MB/s</span>
                )}
                {item.status === 'uploading' && item.etaSeconds && item.etaSeconds > 0 && (
                  <span>{item.etaSeconds < 60 ? `${Math.round(item.etaSeconds)}s left` : `${Math.round(item.etaSeconds / 60)}m left`}</span>
                )}
                {item.processingMode && <span>{item.processingMode.toUpperCase()}</span>}
                {item.videoId && <span>ID {item.videoId.slice(0, 8)}</span>}
              </div>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 lg:w-auto lg:min-w-[220px]">
            <Input
              value={localTitle}
              onChange={handleTitleChange}
              placeholder="Video Title"
              className="h-8 border-border/60 bg-background/70 text-sm"
              disabled={item.status === 'uploading' || item.status === 'processing'}
            />
          </div>

          <div className="flex items-center gap-1 self-end lg:self-auto">
            {item.status === 'error' && onRetry && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRetry(item.id)}
              className="h-7 w-7 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                title="Retry upload"
              >
                <RiRestartLine className="size-4" />
              </Button>
            )}
            {item.status === 'uploading' && onCancel && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCancel(item.id)}
              className="h-7 w-7 text-muted-foreground hover:bg-amber-500/10 hover:text-amber-500"
                title="Cancel upload"
              >
                <RiCloseLine className="size-4" />
              </Button>
            )}
            {(item.status === 'pending' || item.status === 'error' || item.status === 'ready' || item.status === 'cancelled') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(item.id)}
                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <RiCloseLine className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {(item.statusDetail || (item.status === 'error' && item.error)) && (
          <div className="flex items-start justify-between gap-3 border-t border-border/50 pt-2">
            <p
              className={`max-w-3xl text-[11px] leading-5 ${
                item.status === 'error' ? 'text-red-500/80' : 'text-muted-foreground'
              }`}
              title={item.status === 'error' ? item.error : item.statusDetail}
            >
              {item.status === 'error' ? (item.error || item.statusDetail) : item.statusDetail}
            </p>

            {item.processingMode === 'hls' && item.status !== 'error' && (
              <Badge variant="outline" className="hidden h-5 shrink-0 border-border/60 bg-background/70 px-2 text-[9px] font-medium text-muted-foreground sm:inline-flex">
                Adaptive stream
              </Badge>
            )}
          </div>
        )}
      </div>

      <ProgressBar status={item.status} progress={item.progress} />
    </Card>
  )
})

export const UploadQueue = memo(function UploadQueue({ files, onRemove, onUpdate, onRetry, onCancel }: UploadQueueProps) {
  if (files.length === 0) return null

  return (
    <div className="space-y-2">
      {files.map((item) => (
        <QueueItem
          key={item.id}
          item={item}
          onRemove={onRemove}
          onUpdate={onUpdate}
          onRetry={onRetry}
          onCancel={onCancel}
        />
      ))}
    </div>
  )
})
