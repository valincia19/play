import { useEffect, useState, useRef } from "react"
import { useParams } from "react-router-dom"
import { RiPlayCircleLine, RiHardDrive2Line, RiTimeLine } from "@remixicon/react"
import { VideoPlayer } from "@/components/video-player"
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

interface ShareVideoData {
  id: string
  shortId: string
  title: string
  duration: number | null
  fileSizeBytes: number
  status: string
  processingMode: 'mp4' | 'hls'
  createdAt: string
  streamUrl: string
  ads: AdPlacement[]
}

// ─── Smart Tracking Logic ──────────────────────────────────────
const SESSION_KEY = 'vp_vid_session';

function getVisitorSessionId(): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() < parsed.exp) return parsed.id;
    }
  } catch {
    // Fallback for private mode or corrupted JSON
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  const exp = Date.now() + (30 * 60 * 1000); // 30 minutes session

  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, exp }));
  return id;
}

/**
 * Fire-and-forget analytics event using sendBeacon.
 *
 * IMPORTANT: metadata must be a plain object — NOT a JSON string.
 * The backend stores it in a JSONB column and queries it with ->>'provider'.
 * Double-serializing (JSON.stringify before sending) would break JSONB queries.
 */
const sendAnalyticsEvent = (
  videoId: string,
  eventType: 'view' | 'ad_impression' | 'watch_progress',
  metadata?: { provider?: string; type?: string; percentage?: number; duration?: number }
) => {
  // --- Bot-Lite Protection ---
  const isRealUser =
    navigator.userAgent.length > 20 &&
    window.innerWidth > 0 &&
    (typeof document.hasFocus === 'function' ? document.hasFocus() : true);

  if (!isRealUser) return;

  const sid = getVisitorSessionId();
  const url = `${API_BASE_URL}/v/${videoId}/track`;
  const payload = JSON.stringify({ eventType, sessionId: sid, metadata });

  // Use sendBeacon for non-blocking background network request (Professional standard)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  }
}

export function ShareVideo() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<ShareVideoData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/v/${id}/metadata`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.message || 'Failed to fetch video details')
        setData(json.data)
        document.title = json.data.title || 'Video'
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchMetadata()
    return () => { document.title = 'Vercelplay - Video Infrastructure for Developers' }
  }, [id])

  // --- 1. View Tracking (Active Participation) ---
  const viewTracked = useRef(false);

  const handleViewTracked = () => {
    if (!data?.id || viewTracked.current) return;
    viewTracked.current = true;
    sendAnalyticsEvent(data.id, 'view');
  };

  const handleWatchProgress = (percentage: number, duration: number) => {
    if (!data?.id) return;
    sendAnalyticsEvent(data.id, 'watch_progress', { percentage, duration });
  };

  // Inject Script-Based Ads (Popunder, Social Bar, etc.)
  useEffect(() => {
    if (!data?.ads || data.ads.length === 0) return;

    const scriptAds = data.ads.filter((a) =>
      !(a.provider === 'adsterra' && a.adType === 'smart_link') &&
      !(a.provider === 'monetag' && a.adType === 'direct_link') &&
      a.provider !== 'shopee' &&
      a.provider !== 'tiktok' &&
      a.provider !== 'direct' &&
      a.adCode
    );

    if (scriptAds.length === 0) return;

    // Randomize: pick only 1 script ad to avoid conflicts between multiple providers
    const ad = scriptAds[Math.floor(Math.random() * scriptAds.length)];
    const injectedElements: HTMLElement[] = [];

    try {
      const container = document.createElement('div');
      container.innerHTML = ad.adCode.trim();
      const scripts = container.querySelectorAll('script');

      scripts.forEach((s) => {
        const newScript = document.createElement('script');
        if (s.src) newScript.src = s.src;
        if (s.innerHTML) newScript.innerHTML = s.innerHTML;
        Array.from(s.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        document.body.appendChild(newScript);
        injectedElements.push(newScript);
      });

      const nonScripts = Array.from(container.querySelectorAll(':not(script)')) as HTMLElement[];
      nonScripts.forEach((el) => {
        document.body.appendChild(el);
        injectedElements.push(el);
      });

      if (nonScripts.length > 0) {
        const observer = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              sendAnalyticsEvent(data.id, 'ad_impression', { provider: ad.provider, type: ad.adType });
              observer.disconnect();
            }
          });
        }, { threshold: 0.1 });
        nonScripts.forEach(el => observer.observe(el));
      } else {
        setTimeout(() => {
          sendAnalyticsEvent(data.id, 'ad_impression', { provider: ad.provider, type: ad.adType });
        }, 1500);
      }
    } catch (e) {
      console.error('Failed to parse ad script:', e);
    }

    return () => {
      injectedElements.forEach(el => el.remove());
    };
  }, [data?.ads, data?.id]);

  const handleFirstPlay = () => {
    if (!data?.ads) return;

    const directAds = data.ads.filter((a) =>
      (a.provider === 'adsterra' && a.adType === 'smart_link') ||
      (a.provider === 'monetag' && a.adType === 'direct_link') ||
      (a.provider === 'shopee') ||
      (a.provider === 'tiktok') ||
      (a.provider === 'direct')
    );

    if (directAds.length > 0) {
      const randomIndex = Math.floor(Math.random() * directAds.length);
      const popUrl = directAds[randomIndex].adCode.trim();

      if (popUrl) {
        sendAnalyticsEvent(data.id, 'ad_impression', { provider: directAds[randomIndex].provider, type: directAds[randomIndex].adType });
        window.open(popUrl, '_blank');
      }
    }
  }

  // ─── Loading ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex flex-col">
        <header className="flex items-center h-14 px-5 md:px-8">
          <Skeleton className="h-5 w-24 bg-white/10" />
        </header>
        <div className="flex-1 w-full max-w-[960px] mx-auto px-4 md:px-6 pb-12">
          <Skeleton className="w-full aspect-video rounded-lg bg-white/5" />
          <div className="mt-5 space-y-2">
            <Skeleton className="h-6 w-72 bg-white/10" />
            <Skeleton className="h-4 w-48 bg-white/5" />
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
            <RiPlayCircleLine className="size-8 text-white/20" />
          </div>
          <h2 className="text-lg font-semibold text-white">Video Unavailable</h2>
          <p className="text-sm text-white/40 max-w-sm">{error || 'This video could not be found or the link has expired.'}</p>
          <a href="/" className="mt-4 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors">
            Go Home
          </a>
        </div>
      </div>
    )
  }

  const publicStreamUrl = `${API_BASE_URL}${data.streamUrl}`
  const formattedDate = new Date(data.createdAt).toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex flex-col">
      {/* Logo */}
      <header className="flex items-center h-14 px-5 md:px-8">
        <a href="/" className="flex items-center gap-2">
          <img src="/logo.webp" alt="vercelplay" className="size-5 shrink-0" />
          <span className="text-sm font-bold text-white tracking-tight">vercelplay</span>
        </a>
      </header>

      {/* Player + Info */}
      <main className="flex-1 w-full max-w-[960px] mx-auto px-4 md:px-6 pb-12">
        {/* Video Player */}
        <div className="w-full rounded-lg overflow-hidden bg-black">
          <VideoPlayer
            videoId={data.id}
            streamUrl={publicStreamUrl}
            title={data.title}
            poster={data.status === 'ready' ? `${API_BASE_URL}/v/${data.id}/thumbnail` : undefined}
            className="w-full aspect-video"
            processingMode={data.processingMode}
            onFirstPlay={handleFirstPlay}
            onViewTracked={handleViewTracked}
            onWatchProgress={handleWatchProgress}
          />
        </div>

        {/* Title */}
        <h1 className="text-[15px] font-semibold text-white mt-5 leading-snug">
          {data.title}
        </h1>

        {/* Metadata — single line, clean */}
        <div className="flex items-center gap-3 mt-2 text-xs text-white/40">
          {data.duration && (
            <>
              <span className="flex items-center gap-1">
                <RiTimeLine className="size-3" />
                {formatDuration(data.duration)}
              </span>
              <span className="text-white/15">·</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <RiHardDrive2Line className="size-3" />
            {formatBytes(data.fileSizeBytes)}
          </span>
          <span className="text-white/15">·</span>
          <span>{formattedDate}</span>
          {data.status !== 'ready' && (
            <>
              <span className="text-white/15">·</span>
              <span className="text-amber-400 capitalize">{data.status}</span>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
