import { useEffect, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  RiFolder3Fill,
  RiPlayCircleFill,
  RiPlayCircleLine,
  RiHardDrive2Line,
  RiTimeLine,
  RiArrowRightSLine,
} from "@remixicon/react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatBytes, API_BASE_URL, formatDuration } from "@/lib/utils"

// ─── Types ─────────────────────────────────────────────────────
interface AdPlacement {
  id: string
  provider: string
  adType: string
  adCode: string
  isActive: boolean
}

interface FolderVideo {
  id: string
  shortId: string
  title: string
  duration: number | null
  fileSizeBytes: number
  status: string
  processingMode: 'mp4' | 'hls'
  thumbnailUrl: string | null
  visibility: string
  createdAt: string
  streamUrl: string
}

interface ShareFolderData {
  id: string
  shortId: string
  name: string
  visibility: string
  createdAt: string
  videos: FolderVideo[]
  ads: AdPlacement[]
}

export function ShareFolder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ShareFolderData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null)

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/f/${id}/metadata`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.message || 'Failed to fetch folder details')
        setData(json.data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchMetadata()
  }, [id])

  // Inject Script-Based Ads
  useEffect(() => {
    if (!data?.ads || data.ads.length === 0) return

    const scriptAds = data.ads.filter((a) =>
      !(a.provider === 'adsterra' && a.adType === 'smart_link') &&
      !(a.provider === 'monetag' && a.adType === 'direct_link') &&
      a.provider !== 'shopee' &&
      a.provider !== 'tiktok' &&
      a.provider !== 'direct' &&
      a.adCode
    )

    if (scriptAds.length === 0) return

    // Randomize: pick only 1 script ad to avoid conflicts between multiple providers
    const ad = scriptAds[Math.floor(Math.random() * scriptAds.length)]
    const injectedElements: HTMLElement[] = []

    try {
      const container = document.createElement('div')
      container.innerHTML = ad.adCode.trim()
      const scripts = container.querySelectorAll('script')

      scripts.forEach((s) => {
        const newScript = document.createElement('script')
        if (s.src) newScript.src = s.src
        if (s.innerHTML) newScript.innerHTML = s.innerHTML
        Array.from(s.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value))
        document.body.appendChild(newScript)
        injectedElements.push(newScript)
      })

      const nonScripts = Array.from(container.querySelectorAll(':not(script)')) as HTMLElement[]
      nonScripts.forEach((el) => {
        document.body.appendChild(el)
        injectedElements.push(el)
      })
    } catch (e) {
      console.error('Failed to parse ad script:', e)
    }

    return () => {
      injectedElements.forEach(el => el.remove())
    }
  }, [data?.ads])

  // ─── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex flex-col">
        <header className="flex items-center h-14 px-5 md:px-8">
          <Skeleton className="h-5 w-24 bg-white/10" />
        </header>
        <div className="flex-1 w-full max-w-[960px] mx-auto px-4 md:px-6 pb-12">
          <Skeleton className="h-7 w-48 bg-white/10 mb-2" />
          <Skeleton className="h-4 w-32 bg-white/5 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg overflow-hidden bg-white/[0.03]">
                <Skeleton className="aspect-video w-full bg-white/5" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4 bg-white/10" />
                  <Skeleton className="h-3 w-1/2 bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Error ───────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-white/5">
            <RiFolder3Fill className="size-8 text-white/20" />
          </div>
          <h2 className="text-lg font-semibold text-white">Folder Unavailable</h2>
          <p className="text-sm text-white/40 max-w-sm">{error || 'This folder could not be found or the link has expired.'}</p>
        </div>
      </div>
    )
  }

  const formattedDate = new Date(data.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalSize = data.videos.reduce((sum, v) => sum + v.fileSizeBytes, 0)

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex flex-col">

      {/* Logo */}
      <header className="flex items-center h-14 px-5 md:px-8">
        <a href="/" className="flex items-center gap-2">
          <RiPlayCircleFill className="size-5 text-emerald-500" />
          <span className="text-sm font-bold text-white tracking-tight">vercelplay</span>
        </a>
      </header>

      {/* Content */}
      <main className="flex-1 w-full max-w-[960px] mx-auto px-4 md:px-6 pb-12">

        {/* Folder Title */}
        <h1 className="text-[15px] font-semibold text-white leading-snug">
          {data.name}
        </h1>

        {/* Metadata */}
        <div className="flex items-center gap-3 mt-2 mb-6 text-xs text-white/40">
          <span>{data.videos.length} video{data.videos.length !== 1 ? 's' : ''}</span>
          <span className="text-white/15">·</span>
          <span>{formatBytes(totalSize)}</span>
          <span className="text-white/15">·</span>
          <span>{formattedDate}</span>
        </div>

        {/* Video Grid */}
        {data.videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-white/5">
              <RiPlayCircleLine className="size-6 text-white/15" />
            </div>
            <p className="text-sm text-white/30">No public videos in this folder yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.videos.map((video) => {
              const isHovered = hoveredVideo === video.id
              return (
                <div
                  key={video.id}
                  className="group rounded-lg overflow-hidden bg-white/[0.03] border border-white/[0.06] cursor-pointer transition-all duration-200 hover:bg-white/[0.05] hover:border-white/[0.12]"
                  onClick={() => navigate(`/d/${video.shortId || video.id}`)}
                  onMouseEnter={() => setHoveredVideo(video.id)}
                  onMouseLeave={() => setHoveredVideo(null)}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-black/40 overflow-hidden">
                    {video.thumbnailUrl ? (
                      <img
                        src={`${API_BASE_URL}${video.thumbnailUrl}`}
                        alt={video.title}
                        className={`w-full h-full object-cover transition-transform duration-300 ${isHovered ? 'scale-105' : 'scale-100'}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RiPlayCircleLine className="size-10 text-white/8" />
                      </div>
                    )}

                    {/* Play overlay */}
                    <div className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                      <div className="flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-transform duration-200 scale-90 group-hover:scale-100">
                        <RiPlayCircleFill className="size-6 text-white" />
                      </div>
                    </div>

                    {/* Duration */}
                    {video.duration && (
                      <span className="absolute bottom-1.5 right-1.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums">
                        {formatDuration(video.duration)}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="text-[13px] font-medium text-white/85 truncate group-hover:text-white transition-colors leading-snug">
                      {video.title}
                    </h3>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-2 text-[11px] text-white/30">
                        <span className="flex items-center gap-1">
                          <RiHardDrive2Line className="size-3" />
                          {formatBytes(video.fileSizeBytes)}
                        </span>
                        <span className="text-white/10">·</span>
                        <span>{new Date(video.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <RiArrowRightSLine className={`size-3.5 text-white/15 transition-all duration-200 ${isHovered ? 'translate-x-0.5 text-white/40' : ''}`} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
