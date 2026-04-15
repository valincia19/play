import { useLocation, useNavigate } from "react-router-dom"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { RiWifiOffLine } from "@remixicon/react"
import { folderApi, videoApi, directUploadToS3 } from "@/lib/api"
import type { Folder } from "@/lib/types"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context.hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { UploadDropzone } from "@/components/dashboard/video/upload-dropzone"
import { UploadQueue } from "@/components/dashboard/video/upload-queue"
import { FolderTree } from "@/components/dashboard/video/folder-tree"
import {
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiFlashlightLine,
  RiFolder3Fill,
  RiHdFill,
  RiImageCircleLine,
  RiListCheck,
  RiUploadCloud2Line,
} from "@remixicon/react"
import { API_BASE_URL, formatBytes } from "@/lib/utils"

type QualityPresetId = 'fast' | 'saver' | 'balanced' | 'premium' | 'ultra'

interface QualityPreset {
  id: QualityPresetId
  label: string
  description: string
  qualities: string[]
}

const QUALITY_PRESETS: Record<QualityPresetId, QualityPreset> = {
  fast: { id: 'fast', label: 'Fast', description: 'Single 480p stream for the quickest HLS processing.', qualities: ['480p'] },
  saver: { id: 'saver', label: 'Saver', description: '360p + 480p for lightweight playback and lower data usage.', qualities: ['360p', '480p'] },
  balanced: { id: 'balanced', label: 'Balanced', description: '480p + 720p for smoother playback on mixed networks.', qualities: ['480p', '720p'] },
  premium: { id: 'premium', label: 'Premium', description: '720p + 1080p for sharper playback on better screens.', qualities: ['720p', '1080p'] },
  ultra: { id: 'ultra', label: 'Ultra', description: '1080p + 2160p for top-end source footage.', qualities: ['1080p', '2160p'] },
}

export interface UploadFileItem {
  id: string
  file: File
  title: string
  progress: number
  status: 'pending' | 'uploading' | 'processing' | 'ready' | 'error' | 'cancelled'
  error?: string
  videoId?: string
  thumbnailUrl?: string
  processingMode?: 'mp4' | 'hls'
  statusDetail?: string
  uploadSpeed?: number  // bytes per second
  etaSeconds?: number   // estimated time remaining in seconds
  fileSizeBytes?: number // detected size for remote imports
}

export function DashboardVideosUpload() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const plan = (user?.plan || 'free').toLowerCase()

  const queryParams = new URLSearchParams(location.search)
  const queryFolderId = queryParams.get("folderId")

  const [items, setItems] = useState<UploadFileItem[]>([])
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  const [folders, setFolders] = useState<Folder[]>([])
  const [queueStatus, setQueueStatus] = useState<{ waiting: number; processing: number } | null>(null)
  const [storageUsage, setStorageUsage] = useState<{ usedBytes: number; maxBytes: number; usedMB: number; maxMB: number } | null>(null)
  const [bandwidthUsage, setBandwidthUsage] = useState<{ usedBytes: number; maxBytes: number; usedMB: number; maxMB: number; percent: number; isUnlimited: boolean } | null>(null)
  const [isOnline, setIsOnline] = useState(true)

  const [globalFolder, setGlobalFolder] = useState<string>(queryFolderId || 'root')
  const [globalVisibility, setGlobalVisibility] = useState<'private' | 'unlisted' | 'public'>('private')
  const [globalMode, setGlobalMode] = useState<'mp4' | 'hls'>('mp4')
  const [qualityPreset, setQualityPreset] = useState<QualityPresetId>('fast')
  const [isFolderTreeOpen, setIsFolderTreeOpen] = useState(false)

  // URL Import States
  const [importUrl, setImportUrl] = useState('')
  const [importTitle, setImportTitle] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [bulkUrls, setBulkUrls] = useState('')

  // Consolidated polling: single loop instead of N intervals
  const activePolls = useRef<Map<string, string>>(new Map()) // itemId -> videoId
  const pollFailuresRef = useRef<Map<string, number>>(new Map()) // itemId -> consecutive failure count
  const pollBackoffUntilRef = useRef<Map<string, number>>(new Map()) // itemId -> timestamp when to retry
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map())
  const cancelledRef = useRef<Set<string>>(new Set())
  const progressBufferRef = useRef<Map<string, number>>(new Map())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushProgress = useCallback(() => {
    const buffer = progressBufferRef.current
    if (buffer.size === 0) return

    setItems(prev => {
      let changed = false
      const next = prev.map(item => {
        const newProgress = buffer.get(item.id)
        if (newProgress !== undefined && newProgress !== item.progress) {
          changed = true
          return { ...item, progress: newProgress }
        }
        return item
      })
      return changed ? next : prev
    })

    buffer.clear()
  }, [])

  const throttledUpdateProgress = useCallback((id: string, progress: number) => {
    progressBufferRef.current.set(id, progress)
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        flushProgress()
      }, 300)
    }
  }, [flushProgress])

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    }
  }, [])

  useEffect(() => {
    async function fetchFolders() {
      try {
        const result = await folderApi.getAll()
        setFolders(result)
      } catch {
        toast.error('Failed to load folders')
      }
    }

    async function fetchStorageUsage() {
      try {
        const result = await videoApi.getStorageUsage()
        setStorageUsage(result)
      } catch {
        // optional telemetry
      }
    }

    async function fetchBandwidthUsage() {
      try {
        const result = await videoApi.getBandwidthUsage()
        setBandwidthUsage(result)
      } catch {
        // optional telemetry
      }
    }

    fetchFolders()
    fetchStorageUsage()
    fetchBandwidthUsage()

    // Track online/offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => {
      setIsOnline(false)
      toast.error('You are offline. Uploads will pause until connection is restored.')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    const fetchQueueStatus = async () => {
      try {
        const status = await videoApi.getQueueStatus()
        setQueueStatus(status.queue)
      } catch {
        // optional telemetry
      }
    }

    fetchQueueStatus()
    interval = setInterval(fetchQueueStatus, 10000)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  const updateItem = useCallback((id: string, updates: Partial<UploadFileItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }, [])

  // Consolidated poll runner: one interval checks all active videos
  useEffect(() => {
    async function runPollCycle() {
      const entries = Array.from(activePolls.current.entries())
      if (entries.length === 0) return

      const now = Date.now()

      for (const [itemId, videoId] of entries) {
        // Skip if already removed during this cycle
        if (!activePolls.current.has(itemId)) continue

        // Check if we're in backoff period
        const backoffUntil = pollBackoffUntilRef.current.get(itemId)
        if (backoffUntil && now < backoffUntil) {
          continue // Skip this item, still in backoff
        }

        try {
          const { video } = await videoApi.getById(videoId)
          // Success - reset failures and backoff
          pollFailuresRef.current.delete(itemId)
          pollBackoffUntilRef.current.delete(itemId)
          if (!video) continue

          if (video.status === 'ready') {
            const thumbnailUrl = video.thumbnailPath
              ? `${API_BASE_URL}/v/${videoId}/thumbnail`
              : undefined
            updateItem(itemId, {
              status: 'ready',
              thumbnailUrl,
              progress: 100,
              statusDetail: 'Video is ready to publish',
              processingMode: video.processingMode,
              fileSizeBytes: video.fileSizeBytes, // Sync actual size from server
            })
            activePolls.current.delete(itemId)
            pollFailuresRef.current.delete(itemId)
            toast.success(`Video ready: ${video.title}`)
          } else if (video.status === 'error') {
            updateItem(itemId, {
              status: 'error',
              error: video.errorMessage || 'Processing failed',
              statusDetail: 'Processing failed',
              processingMode: video.processingMode,
            })
            activePolls.current.delete(itemId)
            pollFailuresRef.current.delete(itemId)
            toast.error(`Processing failed: ${video.title}`)
          } else if (video.status === 'pending') {
            updateItem(itemId, {
              status: 'pending',
              progress: 100,
              videoId,
              processingMode: video.processingMode,
              statusDetail: 'Upload complete. Waiting for worker queue',
            })
          } else if (video.status === 'processing') {
            updateItem(itemId, {
              status: 'processing',
              progress: 100,
              videoId,
              processingMode: video.processingMode,
              statusDetail: video.processingMode === 'hls'
                ? 'Worker active. Transcoding adaptive stream and generating thumbnail'
                : 'Worker active. Extracting metadata and generating thumbnail',
            })
          }

          // SAFETY GUARD: If stuck in 'uploading' but we have a videoId (meaning upload completed),
          // force transition to the correct status from the server
          // (This handles edge cases where XHR finished but state didn't update)
          const currentItem = itemsRef.current.find(i => i.id === itemId)
          if (currentItem?.status === 'uploading' && (video.status === 'pending' || video.status === 'processing' || video.status === 'ready' || video.status === 'error') && currentItem.videoId) {
            updateItem(itemId, {
              status: video.status,
              progress: 100,
              processingMode: video.processingMode,
              statusDetail: video.status === 'pending'
                ? 'Upload complete. Waiting for worker queue'
                : video.status === 'processing'
                  ? 'Worker active. Processing video'
                  : 'Processing complete',
            })
          }
        } catch {
          const failures = (pollFailuresRef.current.get(itemId) ?? 0) + 1
          pollFailuresRef.current.set(itemId, failures)

          // Exponential backoff: 3s, 6s, 12s, 24s, then cap at 30s
          // Only give up after 60+ seconds of failures (roughly 5+ cycles)
          const backoffMs = Math.min(3000 * Math.pow(2, failures - 1), 30000)
          pollBackoffUntilRef.current.set(itemId, now + backoffMs)

          // Only fail after sustained failures (roughly 60+ seconds)
          if (failures >= 6) {
            updateItem(itemId, {
              status: 'error',
              error: 'Lost connection to server. Please retry.',
              statusDetail: 'Polling lost connection to server',
            })
            activePolls.current.delete(itemId)
            pollFailuresRef.current.delete(itemId)
            pollBackoffUntilRef.current.delete(itemId)
            toast.error('Connection lost - check your network and retry')
          }
        }
      }
    }

    pollTimerRef.current = setInterval(runPollCycle, 3000)

    // Capture ref values for cleanup (React requires stable references in cleanup functions)
    const currentActivePolls = activePolls.current
    const currentPollFailures = pollFailuresRef.current
    const currentPollBackoff = pollBackoffUntilRef.current
    const currentXhrRefs = xhrRefs.current
    const currentCancelled = cancelledRef.current

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
      currentActivePolls.clear()
      currentPollFailures.clear()
      currentPollBackoff.clear()
      currentXhrRefs.forEach((xhr) => xhr.abort())
      currentXhrRefs.clear()
      currentCancelled.clear()
    }
  }, [updateItem])

  const handleFilesSelected = useCallback((files: File[]) => {
    const isFree = plan === 'free'

    // Enforcement: Free plan limit is 1 file total in queue
    if (isFree && files.length > 1) {
      const fileNames = files.map(f => f.name).join(', ')
      toast.error(`Free plan allows 1 file. You selected ${files.length}: ${fileNames.slice(0, 60)}${fileNames.length > 60 ? '...' : ''}. Using first file only.`)
      files = [files[0]]
    }

    if (isFree && items.length >= 1) {
      toast.error("Free plan: 1 file at a time. Upload or remove the current file first.")
      return
    }

    setItems(prev => {
      // Stronger duplicate detection: use size + name + type combination
      // (full hashing would be too slow for large files)
      const existingKeys = new Set(prev.map(item => `${item.file.size}|${item.file.name}|${item.file.type}`))
      const newItems: UploadFileItem[] = []
      const skipped: string[] = []

      for (const file of files) {
        const key = `${file.size}|${file.name}|${file.type}`
        if (existingKeys.has(key)) {
          skipped.push(file.name)
          continue
        }
        existingKeys.add(key)
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name
        newItems.push({
          id: crypto.randomUUID(),
          file,
          title: nameWithoutExt,
          progress: 0,
          status: 'pending',
          statusDetail: 'Ready to upload',
        })
      }

      if (skipped.length > 0) {
        toast.info(`Skipped ${skipped.length} duplicate${skipped.length > 1 ? 's' : ''}: ${skipped.join(', ')}`)
      }

      return [...prev, ...newItems]
    })
  }, [items.length, plan])

  const startPolling = useCallback((itemId: string, videoId: string) => {
    // Simply register this video into the consolidated poll map
    activePolls.current.set(itemId, videoId)
  }, [])

  const availableQualityPresets = useMemo<QualityPreset[]>(() => {
    if (plan === 'pro') return [QUALITY_PRESETS.fast, QUALITY_PRESETS.saver, QUALITY_PRESETS.balanced, QUALITY_PRESETS.premium, QUALITY_PRESETS.ultra]
    if (plan === 'creator') return [QUALITY_PRESETS.fast, QUALITY_PRESETS.saver, QUALITY_PRESETS.balanced, QUALITY_PRESETS.premium]
    return [QUALITY_PRESETS.fast]
  }, [plan])

  useEffect(() => {
    const hasPreset = availableQualityPresets.some((preset) => preset.id === qualityPreset)
    if (!hasPreset) setQualityPreset(availableQualityPresets[0]?.id || 'fast')
  }, [availableQualityPresets, qualityPreset])

  const selectedQualityPreset = useMemo(() => {
    return availableQualityPresets.find((preset) => preset.id === qualityPreset) || availableQualityPresets[0] || QUALITY_PRESETS.fast
  }, [availableQualityPresets, qualityPreset])

  const settingsRef = useRef({ globalFolder, globalVisibility, globalMode, qualityPreset })
  useEffect(() => {
    settingsRef.current = { globalFolder, globalVisibility, globalMode, qualityPreset }
  }, [globalFolder, globalVisibility, globalMode, qualityPreset])

  const uploadSingleItem = useCallback(async (item: UploadFileItem) => {
    const uploadStartTime = Date.now()
    const fileSize = item.file.size

    try {
      updateItem(item.id, { status: 'uploading', progress: 0, error: undefined, statusDetail: 'Preparing upload...' })

      const { globalFolder, globalVisibility, globalMode, qualityPreset } = settingsRef.current
      const selectedPreset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.fast

      // Step 1: Prepare upload — get presigned URL (backend never touches file)
      const { videoId, uploadUrl } = await videoApi.prepareUpload({
        title: item.title,
        folderId: globalFolder === 'root' ? null : globalFolder,
        visibility: globalVisibility,
        processingMode: globalMode,
        qualities: globalMode === 'hls' ? selectedPreset.qualities : undefined,
        fileSizeBytes: item.file.size,
        fileType: item.file.type || 'video/mp4',
      })

      updateItem(item.id, { videoId, statusDetail: 'Uploading directly to storage...' })

      // Step 2: Upload directly to S3 via presigned URL
      await directUploadToS3(
        item.file,
        uploadUrl,
        (percent) => {
          throttledUpdateProgress(item.id, percent)

          // Calculate upload speed and ETA
          const elapsedSeconds = (Date.now() - uploadStartTime) / 1000
          const bytesUploaded = (percent / 100) * fileSize
          const speedBytesPerSecond = elapsedSeconds > 0 ? bytesUploaded / elapsedSeconds : 0
          const remainingBytes = fileSize - bytesUploaded
          const etaSeconds = speedBytesPerSecond > 0 ? remainingBytes / speedBytesPerSecond : 0

          updateItem(item.id, {
            uploadSpeed: speedBytesPerSecond,
            etaSeconds,
          })
        },
        (xhr) => { xhrRefs.current.set(item.id, xhr) }
      )

      if (cancelledRef.current.has(item.id)) {
        cancelledRef.current.delete(item.id)
        await videoApi.abortUpload(videoId).catch(() => {})
        return
      }

      // Step 3: Confirm upload — verify S3 object, queue processing
      updateItem(item.id, { statusDetail: 'Confirming upload...' })
      const response = await videoApi.confirmUpload(videoId)
      const { status, processingMode } = response

      progressBufferRef.current.delete(item.id)

      updateItem(item.id, {
        status,
        progress: 100,
        videoId,
        processingMode,
        statusDetail: status === 'pending'
          ? 'Upload complete. Waiting for processing queue'
          : processingMode === 'hls'
            ? 'Active. Transcoding adaptive stream and generating thumbnail'
            : 'Active. Extracting metadata and generating thumbnail',
      })

      toast.info(status === 'pending'
        ? `Uploaded: ${item.title} - queued for processing`
        : `Uploaded: ${item.title} - processing started`)

      startPolling(item.id, videoId)

      // Refresh storage usage after successful upload
      videoApi.getStorageUsage().then(setStorageUsage).catch(() => {})
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Upload failed'
      if (errMsg === 'S3 upload cancelled' || errMsg === 'Upload cancelled (abort)') return
      console.error(`Upload failed for ${item.title}`, err)
      updateItem(item.id, {
        status: 'error',
        error: errMsg,
        statusDetail: 'Upload failed before processing started',
      })
      toast.error(`Error: ${item.title} - ${errMsg}`)
    } finally {
      xhrRefs.current.delete(item.id)
      cancelledRef.current.delete(item.id)
    }
  }, [startPolling, throttledUpdateProgress, updateItem])

  const handleUploadAll = useCallback(async () => {
    let targetsToUpload: UploadFileItem[] = []
    setItems(currentItems => {
      targetsToUpload = currentItems.filter(i => i.status === 'pending' || i.status === 'error')
      return currentItems
    })
    if (targetsToUpload.length === 0) return

    for (let i = 0; i < targetsToUpload.length; i += 3) {
      const chunk = targetsToUpload.slice(i, i + 3)
      const chunkIds = new Set(chunk.map(c => c.id))
      setItems(prev => prev.map(item => chunkIds.has(item.id) ? { ...item, status: 'uploading' as const } : item))
      await Promise.all(chunk.map(item => uploadSingleItem(item)))
    }
  }, [uploadSingleItem])

  const handleRetry = useCallback(async (id: string) => {
    let targetFile: UploadFileItem | undefined = undefined
    setItems(currentItems => {
      const item = currentItems.find(i => i.id === id)
      if (!item || item.status === 'uploading' || item.status === 'processing') return currentItems
      targetFile = item
      return currentItems.map(i => i.id === id ? { ...i, status: 'uploading' as const } : i)
    })
    if (targetFile) await uploadSingleItem(targetFile)
  }, [uploadSingleItem])

  const handleCancel = useCallback((id: string) => {
    cancelledRef.current.add(id)
    const xhr = xhrRefs.current.get(id)
    if (xhr) {
      xhr.abort()
      xhrRefs.current.delete(id)
    }
    // Find item to get videoId for server-side abort
    const item = items.find(i => i.id === id)
    if (item?.videoId) {
      videoApi.abortUpload(item.videoId).catch(() => {})
    }
    updateItem(id, { status: 'cancelled', error: 'Upload cancelled' })
  }, [updateItem, items])

  const handleRemove = useCallback((id: string) => {
    activePolls.current.delete(id)
    xhrRefs.current.get(id)?.abort()
    xhrRefs.current.delete(id)
    pollFailuresRef.current.delete(id)
    pollBackoffUntilRef.current.delete(id)
    cancelledRef.current.delete(id)
    // Abort server-side upload if we have a videoId
    const item = items.find(i => i.id === id)
    if (item?.videoId && item.status === 'uploading') {
      videoApi.abortUpload(item.videoId).catch(() => {})
    }
    setItems(prev => prev.filter(item => item.id !== id))
  }, [items])

  const handleClearAll = useCallback(() => {
    activePolls.current.clear()
    pollFailuresRef.current.clear()
    pollBackoffUntilRef.current.clear()
    xhrRefs.current.forEach((xhr) => xhr.abort())
    xhrRefs.current.clear()
    cancelledRef.current.clear()
    setItems([])
  }, [])

  const handleStopAll = useCallback(() => {
    // Abort all active uploads and mark as cancelled
    xhrRefs.current.forEach((xhr, id) => {
      xhr.abort()
      cancelledRef.current.add(id)
      updateItem(id, { status: 'cancelled', error: 'Upload stopped' })
    })
    xhrRefs.current.clear()
  }, [updateItem])

  const handleImport = useCallback(async () => {
    if (!importUrl) return toast.error('Please enter a URL')
    try {
      new URL(importUrl)
    } catch {
      return toast.error('Please enter a valid URL')
    }

    setIsImporting(true)
    try {
      const cleanTitle = (importTitle || importUrl.split('/').pop() || 'Imported Video').replace(/\.[^/.]+$/, "")

      const { videoId, fileSizeBytes } = await videoApi.importVideo({
        url: importUrl,
        title: cleanTitle,
        folderId: globalFolder,
        visibility: globalVisibility,
        processingMode: globalMode,
        qualities: globalMode === 'hls' ? QUALITY_PRESETS[qualityPreset].qualities : undefined
      })

      // We fake a local "file" item for the queue visually so it behaves the same
      const fakeFile = new File([''], cleanTitle, { type: 'video/mp4' })
      const itemId = crypto.randomUUID()
      
      const newItem: UploadFileItem = {
        id: itemId,
        file: fakeFile,
        title: cleanTitle,
        progress: 100, // importing relies on worker
        status: 'processing', // mark as processing right away
        videoId,
        processingMode: globalMode,
        fileSizeBytes,
      }
      setItems(prev => [...prev, newItem])
      setImportUrl('')
      setImportTitle('')
      toast.success('Successfully queued URL for import')

      // Start polling for this item
      activePolls.current.set(itemId, videoId)
      if (!pollTimerRef.current) {
        pollTimerRef.current = setInterval(() => {
          // just trigger a re-render or let the common polling hook pick it up
        }, 1000)
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to import URL')
    } finally {
      setIsImporting(false)
    }
  }, [importUrl, importTitle, globalFolder, globalVisibility, globalMode, qualityPreset])

  const handleBulkImport = useCallback(async () => {
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u)
    if (urls.length === 0) return toast.error('Please enter at least one URL')

    const validUrls: string[] = []
    for (const url of urls) {
      try {
        new URL(url)
        validUrls.push(url)
      } catch {
        toast.error(`Invalid URL skipped: ${url.substring(0, 30)}...`)
      }
    }

    if (validUrls.length === 0) return

    setIsImporting(true)
    let successCount = 0

    for (const url of validUrls) {
      try {
        const cleanTitle = (url.split('/').pop() || 'Imported Video').replace(/\.[^/.]+$/, "")

        const { videoId, fileSizeBytes } = await videoApi.importVideo({
          url: url,
          title: cleanTitle,
          folderId: globalFolder,
          visibility: globalVisibility,
          processingMode: globalMode,
          qualities: globalMode === 'hls' ? QUALITY_PRESETS[qualityPreset].qualities : undefined
        })

        // Fake local file for UI consistency
        const fakeFile = new File([''], cleanTitle, { type: 'video/mp4' })
        const itemId = crypto.randomUUID()
        
        const newItem: UploadFileItem = {
          id: itemId,
          file: fakeFile,
          title: cleanTitle,
          progress: 100, // importing relies on worker
          status: 'processing',
          videoId,
          processingMode: globalMode,
          fileSizeBytes,
        }
        setItems(prev => [...prev, newItem])
        successCount++

        activePolls.current.set(itemId, videoId)
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(() => {}, 1000)
        }
      } catch (err: any) {
        toast.error(`Failed to import: ${url.substring(0, 30)}...`)
      }
    }

    setIsImporting(false)
    if (successCount > 0) {
      toast.success(`Successfully queued ${successCount} URLs for import`)
      setBulkUrls('')
    }
  }, [bulkUrls, globalFolder, globalVisibility, globalMode, qualityPreset])

  const hasActiveWork = useMemo(() => items.some(i => i.status === 'uploading' || i.status === 'processing'), [items])
  const hasPending = useMemo(() => items.some(i => i.status === 'pending' || i.status === 'error'), [items])
  const processingCount = useMemo(() => items.filter(i => i.status === 'processing').length, [items])
  const readyCount = useMemo(() => items.filter(i => i.status === 'ready').length, [items])
  const pendingCount = useMemo(() => items.filter(i => i.status === 'pending' || i.status === 'error').length, [items])
  const compactPlanLabel = plan === 'free' ? 'Free' : plan === 'creator' ? 'Creator' : 'Pro'

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <section className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
            <RiArrowLeftLine className="size-4 text-muted-foreground transition-colors hover:text-foreground" />
          </Button>
          <Badge variant="outline" className="h-6 rounded-full border-border/60 bg-background/80 px-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Dashboard Workspace
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_320px] xl:grid-cols-[minmax(0,1.55fr)_330px]">
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-card/95 p-3.5 shadow-sm sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="h-6 rounded-full bg-muted/70 px-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {compactPlanLabel} Upload
                    </Badge>
                    <Badge variant="outline" className="h-6 rounded-full border-border/60 bg-background/80 px-2.5 text-[10px] font-medium uppercase tracking-[0.16em]">
                      {globalMode === 'hls' ? 'Adaptive Streaming' : 'Fast MP4'}
                    </Badge>
                    {globalMode === 'hls' && (
                      <Badge variant="outline" className="h-6 rounded-full border-border/60 bg-background/80 px-2.5 text-[10px] font-medium">
                        {selectedQualityPreset.label}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Upload Videos</h1>
                    <p className="max-w-2xl text-xs leading-5 text-muted-foreground sm:text-sm">
                      A centralized workspace to manage uploads, visibility, and processing modes.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:min-w-[250px]">
                  <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Queued</p>
                    <p className="mt-1 text-base font-semibold">{pendingCount}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Working</p>
                    <p className="mt-1 text-base font-semibold">{processingCount}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/70 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Ready</p>
                    <p className="mt-1 text-base font-semibold">{readyCount}</p>
                  </div>
                </div>
              </div>
            </div>

            {!isOnline && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-600">
                  <RiWifiOffLine className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 sm:text-sm">You are offline</p>
                  <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">
                    Uploads are paused. Reconnect to continue.
                  </p>
                </div>
              </div>
            )}

            {globalMode === 'hls' && queueStatus && queueStatus.waiting > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
                  <RiListCheck className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 sm:text-sm">Processing queue is active</p>
                  <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
                    {queueStatus.waiting} waiting · {queueStatus.processing} processing
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    HLS requires extra processing time. For immediate publishing, switch to MP4 mode.
                  </p>
                </div>
              </div>
            )}

            <Card className="border-border/60 bg-card/95 shadow-sm">
              <CardContent className="space-y-3 p-3.5 sm:p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">Upload Queue</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Drag files here, edit titles, and run them in a single batch.
                    </p>
                  </div>
                  {items.length > 0 && (
                    <Badge variant="outline" className="h-6 rounded-full border-border/60 px-2.5 text-[10px] font-medium uppercase tracking-[0.14em]">
                      {items.length} item
                    </Badge>
                  )}
                </div>

                <Tabs defaultValue="local" className="w-full mb-2">
                  <TabsList className="mb-4">
                    <TabsTrigger value="local">Local File</TabsTrigger>
                    <TabsTrigger value="import">Import URL</TabsTrigger>
                    <TabsTrigger value="bulk-import">Bulk Import</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="local">
                    <UploadDropzone onFilesSelected={handleFilesSelected} />
                  </TabsContent>
                  
                  <TabsContent value="import">
                    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 sm:p-8 hover:bg-muted/30 transition-colors">
                      <div className="flex flex-col items-center justify-center text-center space-y-1 mb-2">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                          <RiFlashlightLine className="size-6" />
                        </div>
                        <h3 className="text-sm font-semibold">Import Remote Video</h3>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Paste a direct URL to a video file (.mp4, .mkv). The server will fetch it directly to your bucket.
                        </p>
                      </div>
                      
                      <div className="space-y-4 max-w-xl mx-auto w-full">
                        <div className="space-y-2">
                          <Label htmlFor="import-url" className="text-xs font-medium">Video URL <span className="text-red-500">*</span></Label>
                          <Input
                            id="import-url"
                            placeholder="https://example.com/video.mp4"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            disabled={isImporting}
                            className="bg-background/50 h-9"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="import-title" className="text-xs font-medium">Custom Title (Optional)</Label>
                          <Input
                            id="import-title"
                            placeholder="Leave blank to use filename"
                            value={importTitle}
                            onChange={(e) => setImportTitle(e.target.value)}
                            disabled={isImporting}
                            className="bg-background/50 h-9"
                          />
                        </div>
                        <Button 
                          onClick={handleImport} 
                          disabled={isImporting || !importUrl}
                          className="w-full"
                        >
                          {isImporting ? 'Queuing Import...' : 'Import to Queue'}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="bulk-import">
                    <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 sm:p-8 hover:bg-muted/30 transition-colors">
                      <div className="flex flex-col items-center justify-center text-center space-y-1 mb-2">
                        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                          <RiListCheck className="size-6" />
                        </div>
                        <h3 className="text-sm font-semibold">Bulk Remote Import</h3>
                        <p className="text-xs text-muted-foreground max-w-sm">
                          Paste multiple direct video URLs (one per line). We'll queue them all for background importing.
                        </p>
                      </div>
                      
                      <div className="space-y-4 max-w-xl mx-auto w-full">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="bulk-urls" className="text-xs font-medium">Video URLs</Label>
                            <span className="text-[10px] text-muted-foreground">{bulkUrls.split('\n').filter(u => u.trim()).length} URLs</span>
                          </div>
                          <Textarea
                            id="bulk-urls"
                            placeholder="https://example.com/video1.mp4&#10;https://example.com/video2.mp4"
                            value={bulkUrls}
                            onChange={(e) => setBulkUrls(e.target.value)}
                            disabled={isImporting}
                            className="bg-background/50 min-h-[120px] max-h-[300px] overflow-y-auto custom-scrollbar font-mono text-xs shrink-0"
                          />
                        </div>
                        <Button 
                          onClick={handleBulkImport} 
                          disabled={isImporting || !bulkUrls.trim()}
                          className="w-full"
                        >
                          {isImporting ? 'Processing Bulk Import...' : 'Import All URLs'}
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {items.length > 0 && (
                  <section className="space-y-2.5 border-t border-border/50 pt-3">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold tracking-tight">
                        Active Items
                        {hasActiveWork && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            · {processingCount} processing
                          </span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2">
                        {hasActiveWork && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleStopAll}
                            className="h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                          >
                            Stop All
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleClearAll}
                          className="h-8 text-muted-foreground hover:text-foreground"
                        >
                          Clear All
                        </Button>
                      </div>
                    </div>

                    <UploadQueue
                      files={items}
                      onRemove={handleRemove}
                      onUpdate={updateItem}
                      onRetry={handleRetry}
                      onCancel={handleCancel}
                    />
                  </section>
                )}

                {items.length > 0 && (
                  <div className="flex justify-end gap-3 border-t border-border/50 pt-3">
                    <Button
                      onClick={handleUploadAll}
                      disabled={!hasPending || hasActiveWork || !isOnline}
                      className="min-w-[160px]"
                    >
                      <RiUploadCloud2Line className="mr-2 size-4" />
                      {!isOnline ? 'Offline...' : items.some(i => i.status === 'uploading') ? 'Uploading...' : 'Upload All'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-border/60 bg-card/95 shadow-sm">
              <CardContent className="space-y-3 p-3.5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Upload Settings</p>
                  <h2 className="text-sm font-semibold tracking-tight">Delivery profile</h2>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Destination Folder</Label>
                  <Popover open={isFolderTreeOpen} onOpenChange={setIsFolderTreeOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-10 w-full justify-between border-border/60 bg-background/70 font-normal shadow-none">
                        <div className="flex items-center gap-2 truncate">
                          <RiFolder3Fill className="size-4 shrink-0 text-amber-500" />
                          <span className="truncate">{globalFolder === 'root' ? '/ Root Directory' : folders.find(f => f.id === globalFolder)?.name || 'Select folder...'}</span>
                        </div>
                        <RiArrowDownSLine className="size-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <FolderTree folders={folders} selectedId={globalFolder} onSelect={(id) => { setGlobalFolder(id); setIsFolderTreeOpen(false) }} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Visibility</Label>
                  <Select value={globalVisibility} onValueChange={(v) => setGlobalVisibility(v as 'private' | 'unlisted' | 'public')}>
                    <SelectTrigger className="h-10 w-full border-border/60 bg-background/70 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (Only me)</SelectItem>
                      <SelectItem value="unlisted">Unlisted (Anyone with link)</SelectItem>
                      <SelectItem value="public">Public</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 rounded-xl border border-border/50 bg-background/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Label className={`flex items-center gap-2 text-[13px] font-bold ${plan !== 'pro' ? 'opacity-60' : ''}`}>
                        <RiHdFill className="size-4 text-primary" />
                        Adaptive Bitrate (HLS)
                      </Label>
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        Automatic quality switching for a smoother playback experience.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {plan !== 'pro' && <Badge variant="secondary" className="text-[9px] uppercase tracking-tighter">Pro</Badge>}
                      <Switch
                        checked={globalMode === 'hls'}
                        onCheckedChange={(checked) => setGlobalMode(checked ? 'hls' : 'mp4')}
                        disabled={plan !== 'pro'}
                      />
                    </div>
                  </div>

                  {globalMode === 'hls' ? (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Streaming Quality</Label>
                          <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                            {selectedQualityPreset.description}
                          </p>
                        </div>
                        <Badge variant="outline" className="border-border/60 bg-background/80 text-[10px] font-medium">
                          {selectedQualityPreset.qualities.join(' + ')}
                        </Badge>
                      </div>
                      <Select value={qualityPreset} onValueChange={(v) => setQualityPreset(v as QualityPresetId)}>
                        <SelectTrigger className="h-10 w-full border-border/60 bg-background/70 shadow-none">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableQualityPresets.map((preset) => (
                            <SelectItem key={preset.id} value={preset.id}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/50 bg-background/70 p-3 text-[11px] leading-5 text-muted-foreground">
                      MP4 mode is the fastest path to publish. Ideal for quick uploads without adaptive streaming.
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
                  <div className="mt-0.5 text-primary">
                    <RiImageCircleLine className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Auto processing</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      Thumbnails and metadata are generated automatically once processed.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/95 shadow-sm">
              <CardContent className="space-y-2.5 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Workflow Notes</p>

                <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/60 p-2.5">
                  <div className="mt-0.5 text-primary">
                    <RiFlashlightLine className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Fast publish path</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      MP4 is best for instant reach. HLS is recommended for public playback with ABR support.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {storageUsage && (
              <Card className="border-border/60 bg-card/95 shadow-sm">
                <CardContent className="space-y-2.5 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Storage</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {storageUsage.maxMB === -1
                          ? `${formatBytes(storageUsage.usedMB * 1024 * 1024)} used`
                          : `${formatBytes(storageUsage.usedMB * 1024 * 1024)} / ${formatBytes(storageUsage.maxMB * 1024 * 1024)}`}
                      </span>
                      {storageUsage.maxMB !== -1 && (
                        <span className={`font-medium ${(storageUsage.usedMB / storageUsage.maxMB) * 100 > 90 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {Math.round((storageUsage.usedMB / storageUsage.maxMB) * 100)}%
                        </span>
                      )}
                    </div>
                    {storageUsage.maxMB !== -1 && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (storageUsage.usedMB / storageUsage.maxMB) * 100 > 90
                              ? 'bg-red-500'
                              : (storageUsage.usedMB / storageUsage.maxMB) * 100 > 70
                                ? 'bg-amber-500'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min((storageUsage.usedMB / storageUsage.maxMB) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                    {storageUsage.maxMB === -1 && (
                      <p className="text-[11px] text-muted-foreground">Unlimited storage</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {bandwidthUsage && (
              <Card className="border-border/60 bg-card/95 shadow-sm">
                <CardContent className="space-y-2.5 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Bandwidth (Weekly)</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {bandwidthUsage.isUnlimited
                          ? `${formatBytes(bandwidthUsage.usedMB * 1024 * 1024)} used`
                          : `${formatBytes(bandwidthUsage.usedMB * 1024 * 1024)} / ${formatBytes(bandwidthUsage.maxMB * 1024 * 1024)}`}
                      </span>
                      {!bandwidthUsage.isUnlimited && (
                        <span className={`font-medium ${bandwidthUsage.percent > 90 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {bandwidthUsage.percent}%
                        </span>
                      )}
                    </div>
                    {!bandwidthUsage.isUnlimited && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            bandwidthUsage.percent > 90
                              ? 'bg-red-500'
                              : bandwidthUsage.percent > 70
                                ? 'bg-amber-500'
                                : 'bg-primary'
                          }`}
                          style={{ width: `${Math.min(bandwidthUsage.percent, 100)}%` }}
                        />
                      </div>
                    )}
                    {bandwidthUsage.isUnlimited && (
                      <p className="text-[11px] text-muted-foreground">Unlimited bandwidth</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </section>
    </div>
  )
}
