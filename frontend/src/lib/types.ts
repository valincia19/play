// ─── Auth & User Types ───────────────────────────────────────

export interface UserProfile {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  plan: string
  isVerified: boolean
  createdAt: string
}

export interface AdminUserRecord extends UserProfile {
  status: 'active' | 'suspended'
  planStartDate: string | null
  planEndDate: string | null
}

// ─── Folder Types ────────────────────────────────────────────

export interface Folder {
  id: string
  name: string
  parentId: string | null
  shortId?: string
  createdAt?: string
  visibility?: 'private' | 'unlisted' | 'public'
}

export interface FolderPath {
  id: string
  name: string
}

// ─── Video Types ─────────────────────────────────────────────

export interface Video {
  id: string
  title: string
  userId: string
  folderId?: string | null
  visibility: 'private' | 'unlisted' | 'public'
  isPrivate: boolean
  status: 'pending' | 'processing' | 'ready' | 'error'
  processingMode: 'mp4' | 'hls'
  qualities?: string[]
  videoUrl: string
  fileSizeBytes: number
  thumbnailPath?: string
  duration?: number
  views?: number
  shortId?: string
  streamUrl?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
  bucketId?: string
}

// ─── Billing Types ───────────────────────────────────────────

export interface Plan {
  id: string
  name: string
  price: number
  features?: PlanFeature[]
  maxVideos?: number
  maxStorageGB?: number
  maxBandwidthGB?: number
}

export interface AdminPlan extends Plan {
  durationDays: number
  isActive: boolean
  position: number
  maxVideos: number
  maxStorage: number
  maxBandwidth: number
  capabilities?: Record<string, boolean>
  features?: PlanFeature[]
}

export interface AdminPlanInput {
  id?: string
  name: string
  price: number
  durationDays: number
  isActive: boolean
  position: number
  maxVideos: number
  maxStorage: number
  maxBandwidth: number
  capabilities: Record<string, boolean>
  features: PlanFeature[]
}

export interface PlanFeature {
  label: string
  highlight?: boolean
}

export interface Subscription {
  id: string
  userId: string
  planId: string
  status: 'active' | 'cancelled' | 'expired'
  startDate: string
  endDate?: string
  cancelAt?: string
}

export interface Transaction {
  id: string
  userId: string
  type: 'subscription' | 'upgrade' | 'refund'
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  description: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AdminTransaction {
  id: string
  userId: string
  planId: string
  amount: number
  type: string
  status: string
  createdAt: string
  user?: {
    email?: string
    name?: string
  }
}

// ─── Admin Stats Types ─────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  totalPlans: number
  totalTransactions: number
  totalVideos: number
  totalViews: number
}

// ─── Domain Types ────────────────────────────────────────────

export interface Domain {
  id: string
  domain: string
  isDefault: boolean
  isVerified: boolean
  isActive: boolean
  sslStatus: 'pending' | 'active' | 'error'
  createdAt: string
  updatedAt: string
}

// ─── Storage Types ───────────────────────────────────────────

export type StorageProviderType = 's3' | 'r2' | 'minio' | 'local' | 'wasabi' | 'b2' | 'backblaze' | 'custom'

export interface StorageProvider {
  id: string
  name: string
  type: StorageProviderType
  isActive: boolean
  createdAt: string
}

export interface StorageBucketCredentials {
  name: string
  region: string | null
  endpoint: string | null
  accessKey: string
  secretKey: string
  providerType: StorageProviderType
}

export interface StorageBucket {
  id: string
  providerId: string
  name: string
  region: string
  endpoint: string | null
  isActive: boolean
  isDefault: boolean
  maxStorageBytes: number
  usedStorageBytes: number
  status: 'online' | 'offline' | 'degraded'
  encryptionVersion?: number
  createdAt: string
  lastHealthCheckAt?: string
}

export interface StorageTestResult {
  connected: boolean
  listObjects: boolean
  upload: boolean
  delete: boolean
  message: string
  errors: string[]
}

export interface FolderListResponse {
  folders: Folder[]
  path: FolderPath[]
}

export interface ActionSuccessResponse {
  success: true
}

export interface VideoListResponse {
  videos: Video[]
  total: number
  hasMore: boolean
}

export interface VideoResponse {
  video: Video
}

export interface VideoUploadResponse {
  videoId: string
  status: 'pending' | 'processing' | 'ready' | 'error'
  processingMode: 'mp4' | 'hls'
  qualities: string[]
}

export interface QueueStatus {
  waiting: number
  processing: number
}

export interface QueueStatusResponse {
  queue: QueueStatus
  message: string
}

export interface WorkerHeartbeat {
  pid?: number
  startedAt?: string | null
  lastSeenAt?: string | null
  uptimeSec?: number
  memoryMb?: number
  isOnline: boolean
}

export interface WorkerMonitorJob {
  id: string
  name: string
  data?: Record<string, unknown>
  attemptsMade: number
  timestamp?: number
  processedOn?: number
  finishedOn?: number
  failedReason?: string
}

export interface WorkerMonitorVideoItem {
  id: string
  title: string
  userId: string
  status: 'pending' | 'processing' | 'ready' | 'error' | 'uploading'
  processingMode: 'mp4' | 'hls'
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
}

export interface WorkerMonitorSnapshot {
  worker: WorkerHeartbeat
  queue: {
    waiting: number
    active: number
    delayed: number
    failed: number
    completed: number
    paused: number
  }
  videos: {
    total: number
    byStatus: Record<string, number>
    recent: WorkerMonitorVideoItem[]
  }
  jobs: {
    active: WorkerMonitorJob[]
    failed: WorkerMonitorJob[]
  }
  generatedAt: string
}
