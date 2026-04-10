import { useState, useRef, useEffect } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { RiFolder3Fill, RiMore2Fill, RiArrowRightSLine, RiDeleteBinLine, RiFolderSharedLine, RiCloseLine, RiShareLine } from "@remixicon/react"
import { useNavigate } from "react-router-dom"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FolderTree } from "@/components/dashboard/video/folder-tree"
import { folderApi, videoApi, domainApi } from "@/lib/api"
import { toast } from "sonner"
import { VideoPlayer } from "@/components/video-player"
import { RiPlayCircleFill, RiLoader4Fill, RiErrorWarningFill, RiTimeLine, RiShareBoxLine, RiLockFill, RiGlobalLine, RiLinksLine } from "@remixicon/react"
import { Textarea } from "@/components/ui/textarea"
import { cn, API_BASE_URL, formatBytes, formatDuration } from "@/lib/utils"

// ─── Type Definitions ─────────────────────────────────────────────

interface Folder {
  id: string
  name: string
  shortId?: string
  parentId: string | null
  depth?: number
  visibility?: 'private' | 'unlisted' | 'public'
}

interface Video {
  id: string
  title: string
  status: 'pending' | 'processing' | 'ready' | 'error'
  thumbnailPath?: string
  duration?: number
  fileSizeBytes?: number
  views?: number
  shortId?: string
  streamUrl?: string
  processingMode?: 'mp4' | 'hls'
  visibility?: 'private' | 'unlisted' | 'public'
  isPrivate?: boolean
}

interface FolderGridProps {
  folders: Folder[]
  videos: Video[]
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  onDeleteFolder?: (id: string) => void;
  onRefresh?: () => void;
}

export function FolderGrid({ folders, videos, hasMore, loadingMore, onLoadMore, onDeleteFolder, onRefresh }: FolderGridProps) {
  const navigate = useNavigate()

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const navigateToFolder = (id: string | null) => {
    if (id) {
      navigate(`/dashboard/videos?folderId=${id}`)
    } else {
      navigate(`/dashboard/videos`)
    }
  }

  const isAllFoldersSelected = folders.length > 0 && folders.every(f => selectedIds.has(f.id))
  const toggleSelectAllFolders = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (isAllFoldersSelected) folders.forEach(f => next.delete(f.id))
      else folders.forEach(f => next.add(f.id))
      return next
    })
  }

  const visibleVideos = videos
  const isAllVideosSelected = visibleVideos.length > 0 && visibleVideos.every(v => selectedIds.has(v.id))
  const toggleSelectAllVideos = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (isAllVideosSelected) visibleVideos.forEach(v => next.delete(v.id))
      else visibleVideos.forEach(v => next.add(v.id))
      return next
    })
  }

  // Rename Inline State
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const startRename = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(id)
    setEditName(name)
  }

  const submitRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null)
      return
    }
    try {
      await folderApi.rename(id, editName)
      toast.success("Folder renamed successfully")
      setEditingId(null)
      if (onRefresh) onRefresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rename folder'
      toast.error(message)
    }
  }

  // Delete Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  const confirmDelete = (ids: string[]) => {
    setItemsToDelete(ids)
    setIsDeleteDialogOpen(true)
  }

  const processDelete = async () => {
    try {
      setIsDeleting(true)

      // Separate folder IDs and video IDs based on current view state
      const folderIds = itemsToDelete.filter(id => folders.some(f => f.id === id))
      const videoIds = itemsToDelete.filter(id => videos.some(v => v.id === id))

      await Promise.all([
        ...folderIds.map(id => folderApi.delete(id)),
        ...videoIds.map(id => videoApi.delete(id))
      ])

      toast.success("Selected items deleted successfully")

      setIsDeleteDialogOpen(false)
      setSelectedIds(new Set()) // clear selection

      if (itemsToDelete.length === 1 && onDeleteFolder && folderIds.length === 1) {
        onDeleteFolder(folderIds[0])
      } else {
        if (onRefresh) onRefresh()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deletion failed'
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  // Edit Video State
  const [editVideo, setEditVideo] = useState<{ id: string, title: string, visibility: 'private' | 'unlisted' | 'public' } | null>(null)
  const [isUpdatingVideo, setIsUpdatingVideo] = useState(false)

  const handleUpdateVideo = async () => {
    if (!editVideo) return
    setIsUpdatingVideo(true)
    try {
      await videoApi.update(editVideo.id, {
        title: editVideo.title,
        visibility: editVideo.visibility
      })
      toast.success("Video updated successfully")
      if (onRefresh) onRefresh()
      setEditVideo(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update video')
    } finally {
      setIsUpdatingVideo(false)
    }
  }

  // Edit Folder State
  const [editFolder, setEditFolder] = useState<{ id: string, name: string, visibility: 'private' | 'unlisted' | 'public' } | null>(null)
  const [isUpdatingFolder, setIsUpdatingFolder] = useState(false)

  const handleUpdateFolder = async () => {
    if (!editFolder) return
    setIsUpdatingFolder(true)
    try {
      await Promise.all([
        folderApi.rename(editFolder.id, editFolder.name),
        folderApi.updateVisibility(editFolder.id, editFolder.visibility),
      ])
      toast.success("Folder updated successfully")
      if (onRefresh) onRefresh()
      setEditFolder(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update folder')
    } finally {
      setIsUpdatingFolder(false)
    }
  }

  // Move Dialog State
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [isTreeOpen, setIsTreeOpen] = useState(false)
  const [itemsToMove, setItemsToMove] = useState<string[]>([])
  const [destinationFolderId, setDestinationFolderId] = useState<string>('root')
  const [allFolders, setAllFolders] = useState<Folder[]>([])
  const [isMoving, setIsMoving] = useState(false)

  const confirmMove = async (ids: string[]) => {
    setItemsToMove(ids)
    setIsMoveDialogOpen(true)
    try {
      const res = await folderApi.getAll()
      setAllFolders(res)
    } catch {
      toast.error("Failed to load folder tree")
    }
  }

  const processMove = async () => {
    try {
      setIsMoving(true)
      const targetId = destinationFolderId === 'root' ? null : destinationFolderId

      const folderIds = itemsToMove.filter(id => folders.some(f => f.id === id))
      const videoIds = itemsToMove.filter(id => videos.some(v => v.id === id))

      await Promise.all([
        ...folderIds.map(id => folderApi.move(id, targetId)),
        ...videoIds.map(id => videoApi.move(id, targetId))
      ])
      toast.success("Items moved successfully")

      setIsMoveDialogOpen(false)
      setSelectedIds(new Set())
      if (onRefresh) onRefresh()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Move failed'
      toast.error(message)
    } finally {
      setIsMoving(false)
    }
  }

  // Share Items State
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [itemsToShare, setItemsToShare] = useState<string[]>([])
  const [shareTab, setShareTab] = useState<'download' | 'embed'>('download')
  const [showTitleInShare, setShowTitleInShare] = useState(false)
  const [shareDomain, setShareDomain] = useState("")
  const [activeDomains, setActiveDomains] = useState<string[]>([])

  // Fetch active domains from backend on mount
  useEffect(() => {
    domainApi.getActive().then(domains => {
      if (domains && domains.length > 0) {
        const domainNames = domains.map(d => d.domain)
        setActiveDomains(domainNames)
        const defaultDomain = domains.find(d => d.isDefault)
        setShareDomain(defaultDomain ? defaultDomain.domain : domainNames[0])
      }
    })
  }, [])

  // Video Playing State
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)

  // Bulk Visibility State
  const [isBulkVisibilityOpen, setIsBulkVisibilityOpen] = useState(false)
  const [bulkVisibilityValue, setBulkVisibilityValue] = useState<'private' | 'unlisted' | 'public'>('private')
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)

  const handleBulkVisibility = async (visibility: 'private' | 'unlisted' | 'public') => {
    setIsBulkUpdating(true)
    try {
      const selectedVideoIds = Array.from(selectedIds).filter(id => videos.some(v => v.id === id))
      const selectedFolderIds = Array.from(selectedIds).filter(id => folders.some(f => f.id === id))

      await Promise.all([
        ...selectedVideoIds.map(id => videoApi.update(id, { visibility })),
        ...selectedFolderIds.map(id => folderApi.updateVisibility(id, visibility)),
      ])

      toast.success(`${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''} set to ${visibility}`)
      setSelectedIds(new Set())
      if (onRefresh) onRefresh()
    } catch (err: any) {
      toast.error(err.message || 'Failed to update visibility')
    } finally {
      setIsBulkUpdating(false)
      setIsBulkVisibilityOpen(false)
    }
  }

  const shareRef = useRef<HTMLTextAreaElement>(null)

  return (
    <div className="flex flex-col space-y-8 relative">

      {/* BULK ACTION BAR */}
      {selectedIds.size > 0 && (
        <div className="absolute -top-14 left-0 right-0 h-14 bg-accent/50 backdrop-blur border border-border/60 rounded-md flex items-center px-2 sm:px-4 justify-between z-10 slide-in-from-top-2 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedIds(new Set())} className="h-8 w-8 hover:bg-background shrink-0">
              <RiCloseLine className="size-5" />
            </Button>
            <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          </div>

          {/* Desktop: full buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => {
              setItemsToShare(Array.from(selectedIds))
              setIsShareDialogOpen(true)
            }}>
              <RiShareLine className="mr-2 size-4" /> Share
            </Button>
            <DropdownMenu open={isBulkVisibilityOpen} onOpenChange={setIsBulkVisibilityOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" disabled={isBulkUpdating}>
                  <RiGlobalLine className="mr-2 size-4" /> Visibility
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => handleBulkVisibility('private')} disabled={isBulkUpdating}>
                  <RiLockFill className="mr-2 size-4 text-muted-foreground" /> Private
                  <span className="ml-auto text-xs text-muted-foreground">Owner only</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkVisibility('unlisted')} disabled={isBulkUpdating}>
                  <RiLinksLine className="mr-2 size-4 text-muted-foreground" /> Unlisted
                  <span className="ml-auto text-xs text-muted-foreground">Link only</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkVisibility('public')} disabled={isBulkUpdating}>
                  <RiGlobalLine className="mr-2 size-4 text-emerald-500" /> Public
                  <span className="ml-auto text-xs text-muted-foreground">Everyone</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="sm" onClick={() => confirmMove(Array.from(selectedIds))}>
              <RiFolderSharedLine className="mr-2 size-4" /> Move
            </Button>
            <Button variant="destructive" size="sm" onClick={() => confirmDelete(Array.from(selectedIds))}>
              <RiDeleteBinLine className="mr-2 size-4" /> Delete
            </Button>
          </div>

          {/* Mobile: icon-only + overflow menu */}
          <div className="flex md:hidden items-center gap-1">
            <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => {
              setItemsToShare(Array.from(selectedIds))
              setIsShareDialogOpen(true)
            }}>
              <RiShareLine className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8">
                  <RiMore2Fill className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => handleBulkVisibility('private')} disabled={isBulkUpdating}>
                  <RiLockFill className="mr-2 size-4" /> Set Private
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkVisibility('unlisted')} disabled={isBulkUpdating}>
                  <RiLinksLine className="mr-2 size-4" /> Set Unlisted
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkVisibility('public')} disabled={isBulkUpdating}>
                  <RiGlobalLine className="mr-2 size-4" /> Set Public
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmMove(Array.from(selectedIds))}>
                  <RiFolderSharedLine className="mr-2 size-4" /> Move
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => confirmDelete(Array.from(selectedIds))}>
                  <RiDeleteBinLine className="mr-2 size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Folders List */}
      {folders.length > 0 && (
        <div className="flex flex-col w-full">
          {/* Header Row for Select All */}
          <div className="flex items-center gap-2 sm:gap-3 h-8 sm:h-10 px-2 sm:px-3 text-xs sm:text-sm text-muted-foreground font-medium mb-1">
            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
              <Checkbox checked={isAllFoldersSelected} onCheckedChange={toggleSelectAllFolders} />
            </div>
            <span className="flex-1">Name</span>
          </div>

          <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
            {folders.map(folder => (
              <div
                key={folder.id}
                className={`group flex flex-row items-center gap-2 sm:gap-3 h-10 sm:h-11 px-2 sm:px-3 rounded-md transition-colors cursor-pointer w-full text-[13px] sm:text-sm border border-transparent hover:border-border/50 ${selectedIds.has(folder.id) ? 'bg-accent/80' : 'hover:bg-accent/50'}`}
                onClick={() => navigateToFolder(folder.id)}
              >
                <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedIds.has(folder.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedIds)
                      if (checked) newSet.add(folder.id)
                      else newSet.delete(folder.id)
                      setSelectedIds(newSet)
                    }}
                  />
                </div>

                <RiFolder3Fill className="size-5 text-primary/80 transition-colors" />

                {editingId === folder.id ? (
                  <div className="flex-1 flex" onClick={(e) => e.stopPropagation()}>
                    <Input
                      autoFocus
                      className="h-7 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitRename(folder.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => submitRename(folder.id)}
                    />
                  </div>
                ) : (
                  <span className="font-medium truncate flex-1 flex items-center gap-2">
                    {folder.name}
                    {folder.visibility === 'private' && (
                      <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1 bg-muted/80 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-border/50" title="Private (Owner only)">
                        <RiLockFill className="size-2.5" /> Private
                      </span>
                    )}
                    {folder.visibility === 'unlisted' && (
                      <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1 bg-muted/80 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-border/50" title="Unlisted (Anyone with link)">
                        <RiLinksLine className="size-2.5" /> Unlisted
                      </span>
                    )}
                    {folder.visibility === 'public' && (
                      <span className="text-[10px] font-medium text-emerald-500 whitespace-nowrap flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shadow-sm" title="Public">
                        <RiGlobalLine className="size-2.5" /> Public
                      </span>
                    )}
                  </span>
                )}

                <div className="flex items-center gap-3 text-muted-foreground mr-2">
                  <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold opacity-0 group-hover:opacity-100 transition-opacity">Folder</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" size="icon" className="h-7 w-7 transition-colors">
                        <RiMore2Fill className="size-4 text-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-[160px]">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        setItemsToShare([folder.id])
                        setIsShareDialogOpen(true)
                      }}>Share</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        setEditFolder({ id: folder.id, name: folder.name, visibility: (folder as any).visibility || 'private' })
                      }}>Edit Settings</DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); confirmMove([folder.id]) }}>Move</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={(e) => {
                        e.stopPropagation()
                        confirmDelete([folder.id])
                      }}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <RiArrowRightSLine className="size-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Videos List */}
      {videos.length > 0 && (
        <div className="flex flex-col w-full mt-2">
          {/* Header Row (Optional for Videos, keeps alignment with folders) */}
          <div className="flex items-center gap-2 sm:gap-3 h-8 px-2 sm:px-3 text-xs sm:text-sm text-muted-foreground font-medium mb-1 border-b border-border/40">
            <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
              <Checkbox checked={isAllVideosSelected} onCheckedChange={toggleSelectAllVideos} />
            </div>
            <div className="w-12 sm:w-16 shrink-0" /> {/* Thumbnail spacer */}
            <span className="flex-1 ml-1 sm:ml-2">Video Title</span>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0 mr-1 sm:mr-2">
              <span className="w-16 text-right hidden sm:block">Duration</span>
              <span className="w-20 text-right hidden sm:block">Size</span>
              <span className="w-16 text-right hidden sm:block">Views</span>
              <div className="w-6 sm:w-8" /> {/* Menu spacer */}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 sm:gap-1 w-full">
            {videos.map(video => (
              <div
                key={video.id}
                className={cn(
                  "group flex flex-row items-center gap-2 sm:gap-3 h-12 sm:h-14 px-2 sm:px-3 rounded-md transition-colors w-full text-[13px] sm:text-sm border border-transparent",
                  video.status === 'ready'
                    ? (selectedIds.has(video.id) ? "bg-accent/80" : "hover:bg-accent/50")
                    : "opacity-60 bg-muted/20"
                )}
              >
                {/* Checkbox for Video Selection */}
                <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                  <Checkbox
                    checked={selectedIds.has(video.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedIds)
                      if (checked) newSet.add(video.id)
                      else newSet.delete(video.id)
                      setSelectedIds(newSet)
                    }}
                  />
                </div>

                {/* Thumbnail */}
                <div
                  className={cn(
                    "relative w-12 h-7 sm:w-16 sm:h-9 shrink-0 rounded overflow-hidden shadow-sm border border-border/50",
                    video.status === 'ready' ? "cursor-pointer ring-offset-background hover:ring-2 hover:ring-primary/50 transition-all" : "bg-muted cursor-not-allowed"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (video.status === 'ready') setPlayingVideo(video);
                  }}
                >
                  {video.thumbnailPath ? (
                    <img
                      src={`${API_BASE_URL}/v/${video.id}/thumbnail`}
                      alt={video.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <RiPlayCircleFill className="size-4 opacity-30" />
                    </div>
                  )}
                  {/* Play Button Overlay (With pointer-events-none to guarantee parent clickability) */}
                  {video.status === 'ready' && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <RiPlayCircleFill className="size-5 text-white drop-shadow-md transform scale-90 group-hover:scale-100 transition-transform" />
                    </div>
                  )}
                </div>

                {/* Title and Badges */}
                <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 ml-1 sm:ml-2">
                  <span className="font-medium truncate text-foreground/90 group-hover:text-foreground transition-colors max-w-[200px] sm:max-w-[400px]">
                    {video.title}
                  </span>

                  {/* Visibility Badges */}
                  {video.visibility === 'private' && (
                    <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1 bg-muted/80 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-border/50" title="Private (Owner only)">
                      <RiLockFill className="size-2.5" /> Private
                    </span>
                  )}
                  {video.visibility === 'unlisted' && (
                    <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap flex items-center gap-1 bg-muted/80 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-border/50" title="Unlisted (Anyone with link)">
                      <RiLinksLine className="size-2.5" /> Unlisted
                    </span>
                  )}
                  {video.visibility === 'public' && (
                    <span className="text-[10px] font-medium text-emerald-500 whitespace-nowrap flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shadow-sm" title="Public">
                      <RiGlobalLine className="size-2.5" /> Public
                    </span>
                  )}

                  {video.status === 'processing' && (
                    <span className="text-[10px] font-bold text-blue-500 whitespace-nowrap flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded shadow-sm animate-pulse">
                      <RiLoader4Fill className="size-3 animate-spin" /> PROCESSING
                    </span>
                  )}
                  {video.status === 'pending' && (
                    <span className="text-[10px] font-bold text-amber-500 whitespace-nowrap flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shadow-sm">
                      <RiTimeLine className="size-3" /> QUEUED
                    </span>
                  )}
                  {video.status === 'error' && (
                    <span className="text-[10px] font-bold text-destructive whitespace-nowrap flex items-center gap-1 bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 rounded shadow-sm">
                      <RiErrorWarningFill className="size-3" /> FAILED
                    </span>
                  )}
                </div>

                {/* Metadata & Actions */}
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span className="w-16 text-right text-xs font-medium tabular-nums hidden sm:block">
                    {video.duration ? formatDuration(video.duration) : '--:--'}
                  </span>
                  <span className="w-20 text-right text-xs font-medium tabular-nums hidden sm:block">
                    {video.fileSizeBytes ? formatBytes(video.fileSizeBytes, 1) : '-- MB'}
                  </span>
                  <span className="w-16 text-right text-xs font-medium tabular-nums hidden sm:block">
                    {video.views || 0}
                  </span>
                  <div className="flex items-center justify-end w-6 sm:w-8">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="secondary" size="icon" className="h-7 w-7 transition-colors">
                          <RiMore2Fill className="size-4 text-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          setItemsToShare([video.id])
                          setIsShareDialogOpen(true)
                        }}>Share</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          setEditVideo({ id: video.id, title: video.title, visibility: video.visibility || 'private' })
                        }}>Edit Settings</DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); confirmMove([video.id]) }}>Move</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={(e) => {
                          e.stopPropagation()
                          confirmDelete([video.id])
                        }}>Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className="flex justify-center pt-4 pb-2">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <>
                    <RiLoader4Fill className="mr-2 size-4 animate-spin" /> Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {(() => {
        const deleteFoldersCount = itemsToDelete.filter(id => folders.some(f => f.id === id)).length
        const deleteVideosCount = itemsToDelete.filter(id => videos.some(v => v.id === id)).length

        let title = "Are you sure?"
        let desc = "This action cannot be undone."

        if (deleteFoldersCount > 0 && deleteVideosCount === 0) {
          title = `Delete ${deleteFoldersCount} Folder${deleteFoldersCount !== 1 ? 's' : ''}`
          desc = `This will permanently delete ${deleteFoldersCount} folder${deleteFoldersCount !== 1 ? 's' : ''} and ALL nested contents inside it. This action cannot be undone.`
        } else if (deleteVideosCount > 0 && deleteFoldersCount === 0) {
          title = `Delete ${deleteVideosCount} Video${deleteVideosCount !== 1 ? 's' : ''}`
          desc = `This will permanently delete ${deleteVideosCount} video${deleteVideosCount !== 1 ? 's' : ''}. Source files will be wiped from object storage. This action cannot be undone.`
        } else if (deleteFoldersCount > 0 && deleteVideosCount > 0) {
          title = `Delete ${itemsToDelete.length} Items`
          desc = `This will permanently delete ${deleteFoldersCount} folder(s) and ${deleteVideosCount} video(s). Folder contents and video source files will be wiped. This action cannot be undone.`
        }

        return (
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{desc}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Wait, Cancel</Button>
                <Button variant="destructive" onClick={processDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Move Confirmation Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Move {itemsToMove.length} Item(s)</DialogTitle>
            <DialogDescription>Select a new destination folder for your items.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <Popover open={isTreeOpen} onOpenChange={setIsTreeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between h-10 bg-background shadow-sm font-normal"
                >
                  <div className="flex items-center gap-2 truncate">
                    <RiFolder3Fill className="size-4 text-amber-500 shrink-0" />
                    <span className="truncate">
                      {destinationFolderId === 'root' ? '/ Root Directory' : allFolders.find(f => f.id === destinationFolderId)?.name || 'Select folder...'}
                    </span>
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="start">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Destination</div>
                <FolderTree
                  folders={allFolders}
                  selectedId={destinationFolderId}
                  onSelect={(id) => {
                    setDestinationFolderId(id)
                    setIsTreeOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={processMove} disabled={isMoving || itemsToMove.includes(destinationFolderId)}>
              {isMoving ? 'Moving...' : 'Move Here'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Video Dialog */}
      <Dialog open={!!editVideo} onOpenChange={(open) => !open && setEditVideo(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Video Settings</DialogTitle>
            <DialogDescription>Update video title and visibility.</DialogDescription>
          </DialogHeader>
          {editVideo && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editVideo.title}
                  onChange={(e) => setEditVideo({ ...editVideo, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Visibility</label>
                <Select
                  value={editVideo.visibility}
                  onValueChange={(val: any) => setEditVideo({ ...editVideo, visibility: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (Owner Only)</SelectItem>
                    <SelectItem value="unlisted">Unlisted (Anyone with link)</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Private videos cannot be accessed via Share URL.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditVideo(null)}>Cancel</Button>
            <Button onClick={handleUpdateVideo} disabled={isUpdatingVideo || !editVideo?.title}>
              {isUpdatingVideo ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Folder Dialog */}
      <Dialog open={!!editFolder} onOpenChange={(open) => !open && setEditFolder(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Folder Settings</DialogTitle>
            <DialogDescription>Update folder name and visibility.</DialogDescription>
          </DialogHeader>
          {editFolder && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editFolder.name}
                  onChange={(e) => setEditFolder({ ...editFolder, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Visibility</label>
                <Select
                  value={editFolder.visibility}
                  onValueChange={(val: any) => setEditFolder({ ...editFolder, visibility: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (Owner Only)</SelectItem>
                    <SelectItem value="unlisted">Unlisted (Anyone with link)</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Private folders cannot be accessed via Share URL.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFolder(null)}>Cancel</Button>
            <Button onClick={handleUpdateFolder} disabled={isUpdatingFolder || !editFolder?.name}>
              {isUpdatingFolder ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <RiShareBoxLine className="size-5 text-primary" />
              <DialogTitle>
                Share {itemsToShare.length === 1 ? (folders.some(f => f.id === itemsToShare[0]) ? 'Folder' : 'Video') : 'Items'}
              </DialogTitle>
            </div>
            <DialogDescription>
              Generate download or embed links for your {itemsToShare.length} selected item(s).
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            {/* Tabs for Videos */}
            {!itemsToShare.some(id => folders.some(f => f.id === id)) ? (
              <Tabs value={shareTab} onValueChange={(v: string) => setShareTab(v as 'download' | 'embed')} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="download">Download Link</TabsTrigger>
                  <TabsTrigger value="embed">Embed Link</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : (
              <div className="h-2" /> // Spacer for folders
            )}

            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show-title"
                  checked={showTitleInShare}
                  onCheckedChange={(checked) => setShowTitleInShare(!!checked)}
                />
                <label
                  htmlFor="show-title"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Show title in share text
                </label>
              </div>

              <div className="space-y-2">
                <Textarea
                  ref={shareRef}
                  readOnly
                  className="h-32 font-mono text-xs resize-none bg-muted/30"
                  onFocus={(e) => e.target.select()}
                  value={itemsToShare.map(id => {
                    const folder = folders.find(f => f.id === id)
                    const video = videos.find(v => v.id === id)
                    const name = showTitleInShare ? (folder?.name || video?.title || '') : ''

                    const protocol = window.location.protocol
                    const baseUrl = shareDomain ? `${protocol}//${shareDomain}` : `[DOMAIN-REQUIRED]`

                    if (folder) return `${name}\n${baseUrl}/f/${folder.shortId || folder.id}`.trim()
                    if (video) {
                      if (shareTab === 'embed') return `${name}\n<iframe src="${baseUrl}/e/${video.shortId || video.id}" width="640" height="360" frameborder="0" allowfullscreen></iframe>`.trim()
                      return `${name}\n${baseUrl}/d/${video.shortId || video.id}`.trim()
                    }
                    return ''
                  }).filter(Boolean).join('\n\n')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Domain Server</label>
                {activeDomains.length > 0 ? (
                  <Select value={shareDomain} onValueChange={setShareDomain}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeDomains.map(d => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={shareDomain}
                    onChange={(e) => setShareDomain(e.target.value)}
                    placeholder="e.g. vidlc.com"
                  />
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="sm:justify-between items-center">
            <div className="text-xs text-muted-foreground font-medium">
              {itemsToShare.length} item(s) ready to share
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsShareDialogOpen(false)}>Close</Button>
              <Button
                onClick={async () => {
                  if (shareRef.current) {
                    shareRef.current.select()
                    try {
                      await navigator.clipboard.writeText(shareRef.current.value)
                      toast.success("Links copied to clipboard")
                    } catch {
                      document.execCommand('copy')
                      toast.success("Links copied to clipboard")
                    }
                  }
                }}
              >
                Copy All
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video Player Modal */}
      <Dialog open={!!playingVideo} onOpenChange={(open) => !open && setPlayingVideo(null)}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden border-none bg-black">
          <DialogTitle className="sr-only">{playingVideo?.title || "Video Player"}</DialogTitle>
          <DialogDescription className="sr-only">Video playback modal</DialogDescription>
          <div className="relative aspect-video w-full">
            {playingVideo && (
              <VideoPlayer
                videoId={playingVideo.id}
                streamUrl={playingVideo.streamUrl}
                title={playingVideo.title}
                poster={playingVideo.thumbnailPath ? `${API_BASE_URL}/v/${playingVideo.id}/thumbnail` : undefined}
                className="w-full h-full rounded-none"
                processingMode={playingVideo.processingMode}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
