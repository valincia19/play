import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RiFolder3Fill, RiFolderAddLine, RiUploadCloud2Line } from "@remixicon/react"
import { videoApi, folderApi } from "@/lib/api"
import { toast } from "sonner"
import { useLocation, useNavigate } from "react-router-dom"
import { FolderBreadcrumb } from "@/components/dashboard/video/folder-breadcrumb"
import { CreateFolderDialog } from "@/components/dashboard/video/create-folder-dialog"
import { FolderGrid } from "@/components/dashboard/video/folder-grid"
import type { Folder, FolderPath, Video } from "@/lib/types"

export function DashboardVideos() {
  const [folders, setFolders] = useState<Folder[]>([])
  const [videos, setVideos] = useState<Video[]>([])
  const [path, setPath] = useState<FolderPath[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()

  // Extract folderId from URL query param
  const queryParams = new URLSearchParams(location.search)
  const currentFolderId = queryParams.get("folderId") || undefined // Fixed to 'folderId'

  const fetchContents = useCallback(async () => {
    try {
      setLoading(true)
      const [folderRes, videoRes] = await Promise.all([
        folderApi.list(currentFolderId),
        videoApi.list(currentFolderId, 30, 0)
      ])

      setFolders(folderRes.folders || [])
      setPath(folderRes.path || [])
      setVideos(videoRes.videos || [])
      setHasMore(videoRes.hasMore)
    } catch {
      toast.error('Directory unavailable or removed')
      if (currentFolderId) {
        navigate('/dashboard/videos', { replace: true })
      }
    } finally {
      setLoading(false)
    }
  }, [currentFolderId, navigate])

  const loadMore = async () => {
    if (loadingMore || !hasMore) return
    try {
      setLoadingMore(true)
      const res = await videoApi.list(currentFolderId, 30, videos.length)
      setVideos(prev => [...prev, ...(res.videos || [])])
      setHasMore(res.hasMore)
    } catch {
      toast.error('Failed to load more videos')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchContents()
  }, [fetchContents])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Videos</h1>
          <p className="text-sm text-muted-foreground">
            Manage your secure video library and configure DRM options.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsCreateFolderOpen(true)}>
            <RiFolderAddLine className="mr-2 size-4" />
            New Folder
          </Button>
          <Button onClick={() => navigate(currentFolderId ? `/dashboard/videos/upload?folderId=${currentFolderId}` : '/dashboard/videos/upload')}>
            <RiUploadCloud2Line className="mr-2 size-4" />
            Upload Video
          </Button>
        </div>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center space-x-2">
            <FolderBreadcrumb currentFolderId={currentFolderId} path={path.map((p, i) => ({ ...p, depth: i }))} />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col space-y-8 mt-2">
              {/* Folder skeletons — list rows matching FolderGrid layout */}
              <div className="flex flex-col w-full">
                <div className="flex items-center gap-3 h-8 px-3 text-xs text-muted-foreground font-medium mb-1">
                  <div className="w-5" />
                  <span className="flex-1">Name</span>
                </div>
                <div className="flex flex-col gap-0.5 w-full">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 h-11 px-3 rounded-md">
                      <Skeleton className="size-5 rounded-sm" />
                      <RiFolder3Fill className="size-5 text-muted-foreground/20 shrink-0" />
                      <Skeleton className="h-4 w-32" />
                      <div className="flex-1" />
                      <Skeleton className="size-7 rounded-md" />
                      <Skeleton className="size-5 rounded-sm" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Video skeletons — list rows matching FolderGrid video layout */}
              <div className="flex flex-col w-full mt-2">
                <div className="flex items-center gap-3 h-8 px-3 text-xs text-muted-foreground font-medium mb-1 border-b border-border/40">
                  <div className="w-5" />
                  <div className="w-12 sm:w-16 shrink-0" />
                  <span className="flex-1 ml-2">Video Title</span>
                  <div className="flex items-center gap-3 shrink-0 mr-2">
                    <span className="w-16 hidden sm:block" />
                    <span className="w-20 hidden sm:block" />
                    <span className="w-16 hidden sm:block" />
                    <div className="w-7" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 w-full">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3 h-14 px-3 rounded-md">
                      <Skeleton className="size-5 rounded-sm" />
                      <Skeleton className="w-12 h-7 sm:w-16 sm:h-9 rounded shrink-0" />
                      <div className="flex-1 min-w-0 flex items-center gap-2 ml-1 sm:ml-2">
                        <Skeleton className="h-4 w-40 sm:w-64" />
                      </div>
                      <div className="flex items-center gap-3 shrink-0 mr-1 sm:mr-2">
                        <Skeleton className="w-16 h-4 hidden sm:block" />
                        <Skeleton className="w-20 h-4 hidden sm:block" />
                        <Skeleton className="w-16 h-4 hidden sm:block" />
                        <Skeleton className="size-7 rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : folders.length === 0 && videos.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/20">
              <div className="flex size-14 mb-4 items-center justify-center rounded-full bg-muted">
                <RiFolder3Fill className="size-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">No contents yet</h3>
              <p className="text-sm text-muted-foreground mb-4 mt-1 text-center max-w-sm">
                This folder is empty. Create a new folder or upload a video to get started.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsCreateFolderOpen(true)}>
                  <RiFolderAddLine className="mr-2 size-4" /> New Folder
                </Button>
              </div>
            </div>
          ) : (
            <FolderGrid
              folders={folders}
              videos={videos}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onRefresh={fetchContents}
            />
          )}
        </CardContent>
      </Card>

      <CreateFolderDialog 
        open={isCreateFolderOpen} 
        onOpenChange={setIsCreateFolderOpen} 
        parentId={currentFolderId} 
        onSuccess={fetchContents}
      />
    </div>
  )
}
