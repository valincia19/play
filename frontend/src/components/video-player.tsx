import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'
import { RiPlayFill, RiPauseFill, RiVolumeUpFill, RiVolumeMuteFill, RiFullscreenLine, RiLoader4Line, RiAlertFill } from '@remixicon/react'
import { cn, API_BASE_URL } from '@/lib/utils'

interface VideoPlayerProps {
  videoId: string
  streamUrl?: string
  title?: string
  poster?: string
  className?: string
  autoPlay?: boolean
  processingMode?: 'mp4' | 'hls'
  onFirstPlay?: () => void
  onViewTracked?: () => void
  onWatchProgress?: (percentage: number, duration: number) => void
}

interface HlsLevel {
  height: number
  bitrate: number
  width?: number
  attrs?: Record<string, unknown>
}

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VideoPlayer(
  {
    videoId,
    streamUrl: providedStreamUrl,
    poster,
    className,
    autoPlay = false,
    processingMode = 'hls',
    onFirstPlay,
    onViewTracked,
    onWatchProgress
  }: VideoPlayerProps
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const trackedMilestones = useRef<Set<number>>(new Set())

  const [hasTriggeredFirstPlay, setHasTriggeredFirstPlay] = useState(false)
  const [hasTrackedView, setHasTrackedView] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [showControls, setShowControls] = useState(true)
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [levels, setLevels] = useState<HlsLevel[]>([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 is Auto
  const [showQualityMenu, setShowQualityMenu] = useState(false)

  // Initialize HLS.js with performance-optimized config
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let streamUrl = providedStreamUrl || `/v/${videoId}`
    if (streamUrl.startsWith('/v/')) {
      streamUrl = `${API_BASE_URL}${streamUrl}`
    }

    if (processingMode === 'mp4') {
      // ─── Native MP4 Playback ───
      video.src = streamUrl
      video.load()
      const onLoaded = () => {
        setIsReady(true)
        setIsLoading(false)
        if (autoPlay) video.play().catch(() => {})
      }
      const onErr = () => {
        setError('Failed to load MP4 stream.')
        setIsLoading(false)
      }
      video.addEventListener('loadedmetadata', onLoaded)
      video.addEventListener('error', onErr)

      return () => {
        video.removeEventListener('loadedmetadata', onLoaded)
        video.removeEventListener('error', onErr)
      }
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1024 * 1024,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        abrEwmaDefaultEstimate: 5000000,
        fragLoadingMaxRetry: 5,
        manifestLoadingMaxRetry: 5,
        levelLoadingMaxRetry: 5,
      })

      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels)
        setIsReady(true)
        setIsLoading(false)
        if (autoPlay) video.play().catch(() => {})
      })

      hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
        setCurrentLevel(data.level)
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              // Wrap setState in setTimeout to avoid calling it synchronously in effect
              setTimeout(() => {
                setError('Stream could not be loaded.')
                setIsLoading(false)
                hls.destroy()
              }, 0)
              break
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.addEventListener('loadedmetadata', () => {
        setIsReady(true)
        setIsLoading(false)
      })
    } else {
      // Wrap setState in setTimeout to avoid calling it synchronously in effect
      setTimeout(() => {
        setError('Browser not supported.')
        setIsLoading(false)
      }, 0)
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [videoId, autoPlay, providedStreamUrl, processingMode])

  // Reset tracking state when video changes
  useEffect(() => {
    setHasTrackedView(false)
    setHasTriggeredFirstPlay(false)
    setIsReady(false)
    setError(null)
  }, [videoId])

  const changeLevel = useCallback((index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index
      setShowQualityMenu(false)
    }
  }, [])

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimeout.current) clearTimeout(hideTimeout.current)
    hideTimeout.current = setTimeout(() => {
      if (isPlaying && !showQualityMenu) setShowControls(false)
    }, 3000)
  }, [isPlaying, showQualityMenu])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (!hasTriggeredFirstPlay) {
      setHasTriggeredFirstPlay(true)
      if (onFirstPlay) onFirstPlay()
    }

    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }, [hasTriggeredFirstPlay, onFirstPlay])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.duration) return
    setCurrentTime(video.currentTime)
    setDuration(video.duration)
    
    const currentPercent = (video.currentTime / video.duration) * 100
    setProgress(currentPercent)

    // View Tracking (starts at 3s)
    if (video.currentTime > 3 && !hasTrackedView) {
      setHasTrackedView(true)
      if (onViewTracked) onViewTracked()
    }

    // Continuous Watch Tracking (ping server roughly every 10 seconds of playback)
    const current10sInterval = Math.floor(video.currentTime / 10)
    if (current10sInterval > 0 && !trackedMilestones.current.has(current10sInterval)) {
      trackedMilestones.current.add(current10sInterval)
      if (onWatchProgress) onWatchProgress(currentPercent, video.duration)
    }
  }, [hasTrackedView, onViewTracked, onWatchProgress])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current
    const video = videoRef.current
    if (!bar || !video || !video.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    video.currentTime = ratio * video.duration
  }, [])

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      video.closest('div')?.requestFullscreen?.()
    }
  }, [])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted
  }, [isMuted])

  return (
    <div
      className={cn('relative group bg-black rounded-lg overflow-hidden border border-white/5 shadow-2xl select-none', className)}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => isPlaying && !showQualityMenu && setShowControls(false)}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        poster={poster}
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => setIsLoading(false)}
      />

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none">
          <RiLoader4Line className="size-10 text-white/80 animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-20 p-6 text-center">
          <RiAlertFill className="size-12 text-destructive mb-3" />
          <h3 className="text-lg font-bold text-white mb-2">Streaming Error</h3>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      )}

      {isReady && !error && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-end transition-opacity duration-300 pointer-events-none',
            showControls ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

          <div className="relative p-4 space-y-2 z-10 pointer-events-auto">
            <div
              ref={progressBarRef}
              className="h-1.5 bg-white/20 w-full rounded-full overflow-hidden cursor-pointer group/bar hover:h-2.5 transition-all"
              onClick={handleSeek}
            >
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
                  {isPlaying ? <RiPauseFill className="size-6" /> : <RiPlayFill className="size-6" />}
                </button>
                <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-primary transition-colors">
                  {isMuted ? <RiVolumeMuteFill className="size-5" /> : <RiVolumeUpFill className="size-5" />}
                </button>
                <span className="text-[11px] font-medium text-white/70 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-4">
                {levels.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowQualityMenu(!showQualityMenu)}
                      className="text-[10px] font-bold px-2 py-1 rounded bg-white/10 text-white/90 hover:bg-white/20 transition-all border border-white/10 uppercase tracking-tighter"
                    >
                      {currentLevel === -1 ? 'Auto' : `${levels[currentLevel]?.height}p`}
                    </button>

                    {showQualityMenu && (
                      <div className="absolute bottom-full right-0 mb-2 w-32 bg-zinc-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden">
                        <button
                          onClick={() => changeLevel(-1)}
                          className={cn(
                            'w-full text-left px-3 py-2 text-[11px] hover:bg-white/5 transition-colors',
                            currentLevel === -1 ? 'text-primary font-bold' : 'text-white/60'
                          )}
                        >
                          Auto
                        </button>
                        {[...levels].reverse().map((level, i) => {
                          const idx = levels.length - 1 - i
                          return (
                            <button
                              key={idx}
                              onClick={() => changeLevel(idx)}
                              className={cn(
                                'w-full text-left px-3 py-2 text-[11px] hover:bg-white/5 border-t border-white/5 transition-colors',
                                currentLevel === idx ? 'text-primary font-bold' : 'text-white/60'
                              )}
                            >
                              {level.height}p ({Math.round(level.bitrate / 1000)} kbps)
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
                  <RiFullscreenLine className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReady && !isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div
            className="flex items-center justify-center size-16 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-300 hover:scale-110 hover:bg-black/60 hover:border-white/40 cursor-pointer pointer-events-auto group"
            onClick={togglePlay}
          >
            <RiPlayFill className="size-8 text-white translate-x-[1px]" />
          </div>
        </div>
      )}
    </div>
  )
}
