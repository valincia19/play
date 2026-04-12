export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ApiErrorData
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterResponse {
  message: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
}

export interface VerifyResponse {
  message: string
}

export interface ChangePasswordPayload {
  currentPassword: string
  newPassword: string
}

export interface ApiErrorData {
  code: string
  message: string
}

export class ApiError extends Error {
  code: string
  constructor(error: ApiErrorData) {
    super(error.message)
    this.name = 'ApiError'
    this.code = error.code
  }
}

// Import types
import type {
  UserProfile,
  AdminUserRecord,
  Folder,
  FolderListResponse,
  ActionSuccessResponse,
  VideoListResponse,
  VideoResponse,
  VideoUploadResponse,
  Plan,
  AdminPlan,
  AdminPlanInput,
  Subscription,
  Transaction,
  AdminTransaction,
  AdminStats,
  StorageProvider,
  StorageBucket,
  StorageTestResult,
  QueueStatusResponse,
  WorkerMonitorSnapshot,
  Domain
} from './types'

/**
 * Returns the stored access token, or null if not logged in.
 */
export function getAccessToken(): string | null {
  return localStorage.getItem('accessToken')
}

/**
 * Core fetch wrapper with JSON parsing, error handling, and optional auth.
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit & { auth?: boolean }
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  // Attach Authorization header for authenticated requests
  if (options?.auth) {
    const token = getAccessToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // Prevent browser HTTP cache for authenticated / mutating requests
  // Admin dashboard must always receive fresh data from the backend
  const fetchInit: RequestInit = {
    ...options,
    headers,
    cache: 'no-store',
  }
  // Strip non-standard properties that fetch() would ignore anyway
  delete (fetchInit as Record<string, unknown>).auth

  const response = await fetch(url, fetchInit)

  const result: ApiResponse<T> = await response.json()

  // Handle non-2xx HTTP status codes
  if (!response.ok) {
    // Session expired or access revoked
    if ((response.status === 401 || response.status === 403) && fetchInit.headers && 'Authorization' in (fetchInit.headers as Record<string, string>)) {
      console.warn('[apiFetch] Auth failure (%d) on %s', response.status, url)
      
      if (response.status === 401) {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        // Only redirect if we're not already on the login page
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login?reason=session_expired'
          // Throw to stop further execution
          throw new ApiError({ code: 'SESSION_EXPIRED', message: 'Session expired. Please log in again.' })
        }
      } else if (response.status === 403) {
        throw new ApiError({ code: 'FORBIDDEN', message: 'Access denied: You do not have permission to perform this action.' })
      }
    }
    if (result.error) {
      throw new ApiError(result.error)
    }
    throw new Error(result.data && typeof result.data === 'object' && 'message' in result.data
      ? String((result.data as Record<string, unknown>).message)
      : `Request failed with status ${response.status}`)
  }

  // Safety net: handle success:false even on HTTP 200
  if (result.success === false) {
    if (result.error) {
      throw new ApiError(result.error)
    }
    throw new Error('An unexpected error occurred')
  }

  return result.data as T
}

export const api = {
  register: async (data: RegisterInput): Promise<RegisterResponse> => {
    return apiFetch<RegisterResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  login: async (data: LoginInput): Promise<LoginResponse> => {
    return apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  verify: async (token: string): Promise<VerifyResponse> => {
    return apiFetch<VerifyResponse>(`/auth/verify?token=${token}`, {
      method: 'GET',
    })
  },

  /** Get current authenticated user's profile */
  getMe: async (): Promise<UserProfile> => {
    return apiFetch<UserProfile>('/auth/me', {
      method: 'GET',
      auth: true,
    })
  },

  /** Update current authenticated user's profile */
  updateMe: async (data: { name?: string }): Promise<{ message: string; user: UserProfile }> => {
    return apiFetch<{ message: string; user: UserProfile }>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
      auth: true,
    })
  },

  /** Delete current authenticated user's account */
  deleteMe: async (): Promise<{ message: string }> => {
    return apiFetch<{ message: string }>('/auth/me', {
      method: 'DELETE',
      auth: true,
    })
  },

  /** Get all users (Admin only) */
  getAllUsers: async (): Promise<UserProfile[]> => {
    return apiFetch<UserProfile[]>('/auth/users', {
      method: 'GET',
      auth: true,
    })
  },

  /** Get all active plans from DB */
  getPlans: async (): Promise<Plan[]> => {
    return apiFetch<Plan[]>('/billing/plans', {
      method: 'GET',
    })
  },

  /** Get current subscription info */
  getSubscription: async (): Promise<Subscription> => {
    return apiFetch<Subscription>('/billing/subscription', {
      method: 'GET',
      auth: true,
    })
  },

  /** Get transaction history */
  getTransactionHistory: async (): Promise<Transaction[]> => {
    return apiFetch<Transaction[]>('/billing/history', {
      method: 'GET',
      auth: true,
    })
  },

  /** Upgrade Plan */
  createCheckoutSession: async (planId: string) => {
    return apiFetch<{ qrString?: string, totalPayment?: number, expiredAt?: string, transactionId?: string, paymentUrl?: string }>('/billing/checkout/qris', {
      method: 'POST',
      body: JSON.stringify({ planId }),
      auth: true
    })
  },
  getTransaction: async (id: string) => {
    return apiFetch<any>(`/billing/transaction/${id}`, { auth: true })
  },
  upgradePlan: async (plan: string) => {
    return apiFetch<{ message: string }>('/billing/upgrade', {
      method: 'POST',
      body: JSON.stringify({ plan }),
      auth: true,
    })
  },

  /** Remove tokens and log out */
  logout: () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  },

  /** Generic GET wrapper for ad-hoc queries (e.g. Analytics) */
  get: async <T>(endpoint: string, auth = true): Promise<T> => {
    return apiFetch<T>(endpoint, { method: 'GET', auth })
  },

  /** Change user password */
  changePassword: async (data: ChangePasswordPayload): Promise<void> => {
    return apiFetch<void>('/auth/change-password', { method: 'POST', body: JSON.stringify(data), auth: true })
  },
}

export const folderApi = {
  /** List folders (root or children of parentId) + breadcrumb path */
  list: async (parentId?: string): Promise<FolderListResponse> => {
    const query = parentId ? `?parentId=${parentId}` : ''
    return apiFetch<FolderListResponse>(`/folders${query}`, { auth: true })
  },

  /** Get all folders flat array */
  getAll: async (): Promise<Folder[]> => {
    return apiFetch<Folder[]>('/folders/all', { auth: true })
  },

  /** Create a new folder */
  create: async (name: string, parentId?: string): Promise<Folder> => {
    return apiFetch<Folder>('/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parentId }),
      auth: true
    })
  },

  /** Delete a folder */
  delete: async (id: string): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/folders/${id}`, { method: 'DELETE', auth: true })
  },

  /** Rename a folder */
  rename: async (id: string, name: string): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/folders/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
      auth: true
    })
  },

  /** Move a folder */
  move: async (id: string, newParentId: string | null): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/folders/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ newParentId }),
      auth: true
    })
  },

  /** Update folder visibility */
  updateVisibility: async (id: string, visibility: 'private' | 'unlisted' | 'public'): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/folders/${id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility }),
      auth: true
    })
  },
}

export const videoApi = {
  /** Get processing queue status */
  getQueueStatus: async (): Promise<QueueStatusResponse> => {
    return apiFetch<QueueStatusResponse>('/videos/queue-status', { auth: true })
  },

  /** Get current storage usage vs plan limit */
  getStorageUsage: async (): Promise<{ usedBytes: number; maxBytes: number; usedMB: number; maxMB: number }> => {
    return apiFetch('/videos/storage-usage', { auth: true })
  },

  /** Get current weekly bandwidth usage vs plan limit */
  getBandwidthUsage: async (): Promise<{ usedBytes: number; maxBytes: number; usedMB: number; maxMB: number; percent: number; isUnlimited: boolean; weekStart: string; weekEnd: string }> => {
    return apiFetch('/videos/bandwidth-usage', { auth: true })
  },

  /** List videos in a folder (or root) with pagination */
  list: async (folderId?: string, limit?: number, offset?: number): Promise<VideoListResponse> => {
    const params = new URLSearchParams()
    if (folderId) params.set('folderId', folderId)
    if (limit) params.set('limit', String(limit))
    if (offset) params.set('offset', String(offset))
    const query = params.toString() ? `?${params.toString()}` : ''
    return apiFetch<VideoListResponse>(`/videos${query}`, { auth: true })
  },

  /** Get a single video by ID (used for status polling) */
  getById: async (id: string): Promise<VideoResponse> => {
    return apiFetch<VideoResponse>(`/videos/${id}`, { auth: true })
  },

  /**
   * Import video via remote URL (Leecher)
   */
  importVideo: async (data: {
    url: string
    title?: string
    folderId?: string | null
    visibility?: 'private' | 'unlisted' | 'public'
    processingMode?: 'mp4' | 'hls'
    qualities?: string[]
  }): Promise<VideoUploadResponse> => {
    return apiFetch<VideoUploadResponse>('/videos/import', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        folderId: data.folderId === 'root' ? null : data.folderId
      }),
      auth: true
    })
  },

  /**
   * Upload video through backend (S3 is hidden).
   * Uses XHR for upload progress tracking.
   * Returns { videoId, status }.
   */
  upload: (
    file: File,
    metadata: {
      title?: string
      folderId?: string | null
      visibility?: 'private' | 'unlisted' | 'public'
      processingMode?: 'mp4' | 'hls'
      qualities?: string[]
    },
    onProgress?: (percent: number) => void,
    onXhr?: (xhr: XMLHttpRequest) => void
  ): Promise<VideoUploadResponse> => {
    return new Promise((resolve, reject) => {
      const token = getAccessToken()
      if (!token) return reject(new Error('Not authenticated'))

      const formData = new FormData()
      formData.append('file', file)
      if (metadata.title) formData.append('title', metadata.title)
      if (metadata.folderId && metadata.folderId !== 'root') formData.append('folderId', metadata.folderId)
      if (metadata.visibility) formData.append('visibility', metadata.visibility)
      if (metadata.processingMode) formData.append('processingMode', metadata.processingMode)
      if (metadata.qualities && metadata.qualities.length > 0) {
        metadata.qualities.forEach((q) => formData.append('qualities', q))
      }

      const xhr = new XMLHttpRequest()
      onXhr?.(xhr)

      xhr.open('POST', `${API_BASE_URL}/videos/upload`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      // Do NOT set Content-Type — browser sets multipart/form-data with boundary automatically

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded * 100) / event.total)
          onProgress?.(percent)
        }
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText)
          if (xhr.status >= 200 && xhr.status < 300 && res.data) {
            resolve(res.data)
          } else {
            // API returns { success, data, error: { code, message } }
            const msg = res.error?.message || res.message || `Upload failed: HTTP ${xhr.status}`
            reject(new Error(msg))
          }
        } catch {
          reject(new Error(`Upload failed: HTTP ${xhr.status}`))
        }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.ontimeout = () => reject(new Error('Upload timed out'))
      xhr.onabort = () => reject(new Error('Upload cancelled (abort)'))

      // No timeout for large video files — let it run
      xhr.timeout = 0
      xhr.send(formData)
    })
  },

  /** Update a video (title, visibility) */
  update: async (id: string, data: { title?: string; visibility?: string }): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/videos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      auth: true
    })
  },

  /** Delete a video */
  delete: async (id: string): Promise<VideoResponse> => {
    return apiFetch<VideoResponse>(`/videos/${id}`, {
      method: 'DELETE',
      auth: true
    })
  },

  /** Move a video */
  move: async (id: string, folderId: string | null): Promise<VideoResponse> => {
    return apiFetch<VideoResponse>(`/videos/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId }),
      auth: true
    })
  },

  // ── Presigned URL Direct Upload ──────────────────────────────

  /** Step 1: Prepare upload — get presigned URL from backend */
  prepareUpload: async (metadata: {
    title?: string
    folderId?: string | null
    visibility?: 'private' | 'unlisted' | 'public'
    processingMode?: 'mp4' | 'hls'
    qualities?: string[]
    fileSizeBytes: number
    fileType: string
  }): Promise<{ videoId: string; uploadUrl: string }> => {
    return apiFetch('/videos/prepare-upload', {
      method: 'POST',
      body: JSON.stringify(metadata),
      auth: true,
    })
  },

  /** Step 3: Confirm upload — tell backend the file is in S3 */
  confirmUpload: async (videoId: string): Promise<VideoUploadResponse> => {
    return apiFetch(`/videos/${videoId}/confirm-upload`, {
      method: 'POST',
      auth: true,
    })
  },

  /** Abort upload — cancel and clean up */
  abortUpload: async (videoId: string): Promise<void> => {
    return apiFetch(`/videos/${videoId}/abort-upload`, {
      method: 'POST',
      auth: true,
    })
  },
}

/**
 * Upload file directly to S3 using a presigned URL.
 * Uses XHR for native upload progress tracking.
 * The presigned URL contains all auth params — no Authorization header needed.
 */
export function directUploadToS3(
  file: File,
  presignedUrl: string,
  onProgress?: (percent: number) => void,
  onXhr?: (xhr: XMLHttpRequest) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    onXhr?.(xhr)

    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', file.type)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded * 100) / event.total)
        onProgress?.(percent)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`S3 upload failed: HTTP ${xhr.status}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during S3 upload'))
    xhr.ontimeout = () => reject(new Error('S3 upload timed out'))
    xhr.onabort = () => reject(new Error('S3 upload cancelled'))

    xhr.timeout = 0 // No timeout for large files
    xhr.send(file)
  })
}

export const adminApi = {
  getPlans: async (): Promise<AdminPlan[]> => {
    return apiFetch<AdminPlan[]>('/admin/plans', { auth: true })
  },
  createPlan: async (data: AdminPlanInput): Promise<AdminPlan> => {
    return apiFetch<AdminPlan>('/admin/plans', { method: 'POST', body: JSON.stringify(data), auth: true })
  },
  updatePlan: async (id: string, data: Partial<AdminPlanInput>): Promise<AdminPlan> => {
    return apiFetch<AdminPlan>(`/admin/plans/${id}`, { method: 'PUT', body: JSON.stringify(data), auth: true })
  },
  deletePlan: async (id: string): Promise<AdminPlan> => {
    return apiFetch<AdminPlan>(`/admin/plans/${id}`, { method: 'DELETE', auth: true })
  },
  getUsers: async (): Promise<AdminUserRecord[]> => {
    return apiFetch<AdminUserRecord[]>('/admin/users', { auth: true })
  },
  updateUser: async (id: string, data: {
    name?: string
    email?: string
    password?: string
    role?: 'user' | 'admin'
    status?: 'active' | 'suspended'
    plan?: string
    planStartDate?: string
    planEndDate?: string
  }): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data), auth: true })
  },
  givePlan: async (userId: string, planId: string, durationDaysOverride?: number): Promise<ActionSuccessResponse> => {
    return apiFetch<ActionSuccessResponse>('/admin/give-plan', { method: 'POST', body: JSON.stringify({ userId, planId, durationDaysOverride }), auth: true })
  },
  getTransactions: async (): Promise<AdminTransaction[]> => {
    return apiFetch<AdminTransaction[]>('/admin/transactions', { auth: true })
  },
  getStats: async (): Promise<AdminStats> => {
    return apiFetch<AdminStats>('/admin/stats', { auth: true })
  },
  getWorkerMonitor: async (): Promise<WorkerMonitorSnapshot> => {
    return apiFetch<WorkerMonitorSnapshot>('/admin/monitor/worker', { auth: true })
  },
  cleanupStorage: async (): Promise<{ deletedItems: number; bytesFreed: number; mbFreed: number }> => {
    return apiFetch<{ deletedItems: number; bytesFreed: number; mbFreed: number }>('/admin/monitor/cleanup-storage', { method: 'POST', auth: true })
  },

  // --- STORAGE ---
  storage: {
    getProviders: async (): Promise<StorageProvider[]> => {
      return apiFetch<StorageProvider[]>('/admin/storage/providers', { auth: true })
    },
    toggleProvider: async (id: string, isActive: boolean): Promise<StorageProvider> => {
      return apiFetch<StorageProvider>(`/admin/storage/providers/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
        auth: true
      })
    },
    getBuckets: async (): Promise<StorageBucket[]> => {
      return apiFetch<StorageBucket[]>('/admin/storage/buckets', { auth: true })
    },
    createBucket: async (data: Record<string, unknown>): Promise<StorageBucket> => {
      return apiFetch<StorageBucket>('/admin/storage/buckets', { method: 'POST', body: JSON.stringify(data), auth: true })
    },
    updateBucket: async (id: string, data: Record<string, unknown>): Promise<StorageBucket> => {
      return apiFetch<StorageBucket>(`/admin/storage/buckets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        auth: true
      })
    },
    setDefaultBucket: async (id: string): Promise<void> => {
      return apiFetch<void>(`/admin/storage/buckets/${id}/default`, { method: 'PATCH', auth: true })
    },
    deleteBucket: async (id: string): Promise<void> => {
      return apiFetch<void>(`/admin/storage/buckets/${id}`, { method: 'DELETE', auth: true })
    },
    testBucket: async (id: string): Promise<StorageTestResult> => {
      return apiFetch<StorageTestResult>(`/admin/storage/buckets/${id}/test`, { method: 'POST', auth: true })
    },
    fixCors: async (id: string): Promise<{ success: boolean; message: string }> => {
      return apiFetch<{ success: boolean; message: string }>(`/admin/storage/buckets/${id}/fix-cors`, {
        method: 'POST',
        auth: true
      })
    },
  },

  // --- BLOG ---
  blog: {
    getAll: async (): Promise<BlogPost[]> => {
      return apiFetch<BlogPost[]>('/admin/blog', { auth: true })
    },
    create: async (data: BlogPostInput): Promise<BlogPost> => {
      return apiFetch<BlogPost>('/admin/blog', { method: 'POST', body: JSON.stringify(data), auth: true })
    },
    update: async (id: string, data: Partial<BlogPostInput>): Promise<BlogPost> => {
      return apiFetch<BlogPost>(`/admin/blog/${id}`, { method: 'PUT', body: JSON.stringify(data), auth: true })
    },
    delete: async (id: string): Promise<{ id: string }> => {
      return apiFetch<{ id: string }>(`/admin/blog/${id}`, { method: 'DELETE', auth: true })
    },
  },

  // --- DOMAINS ---
  domains: {
    getAll: async (): Promise<Domain[]> => {
      return apiFetch<Domain[]>('/admin/domains', { auth: true })
    },
    create: async (data: { domain: string; isActive?: boolean }): Promise<Domain> => {
      return apiFetch<Domain>('/admin/domains', { method: 'POST', body: JSON.stringify(data), auth: true })
    },
    update: async (id: string, data: { domain?: string; isActive?: boolean }): Promise<Domain> => {
      return apiFetch<Domain>(`/admin/domains/${id}`, { method: 'PUT', body: JSON.stringify(data), auth: true })
    },
    setDefault: async (id: string): Promise<Domain> => {
      return apiFetch<Domain>(`/admin/domains/${id}/default`, { method: 'PATCH', auth: true })
    },
    verify: async (id: string): Promise<Domain> => {
      return apiFetch<Domain>(`/admin/domains/${id}/verify`, { method: 'PATCH', auth: true })
    },
    delete: async (id: string): Promise<{ id: string }> => {
      return apiFetch<{ id: string }>(`/admin/domains/${id}`, { method: 'DELETE', auth: true })
    },
  },
}

/** Domain API for dashboard (authenticated, non-admin) */
export const domainApi = {
  /** Get all active domains for share links */
  getActive: async (): Promise<Domain[]> => {
    try {
      return await apiFetch<Domain[]>('/domains/active', { auth: true })
    } catch {
      return []
    }
  },
}

/** Public blog API (no auth) */
export const blogApi = {
  getPosts: async (): Promise<BlogPost[]> => {
    return apiFetch<BlogPost[]>('/blog')
  },
  getPost: async (slug: string): Promise<BlogPost> => {
    return apiFetch<BlogPost>(`/blog/${slug}`)
  },
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  coverImageUrl: string | null
  excerpt: string
  content: string
  category: string
  status: 'draft' | 'published'
  authorId: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BlogPostInput {
  title: string
  slug: string
  coverImageUrl?: string
  excerpt: string
  content: string
  category: string
  status: 'draft' | 'published'
  authorId: string
}

export interface AdSettingsPayload {
  provider: string
  adType: string
  adCode: string
  isActive: boolean
}

export const adsApi = {
  getSettings: async (): Promise<AdSettingsPayload[]> => {
    return apiFetch<AdSettingsPayload[]>('/ads', { auth: true })
  },
  saveSettings: async (data: AdSettingsPayload): Promise<AdSettingsPayload> => {
    return apiFetch<AdSettingsPayload>('/ads', { method: 'POST', body: JSON.stringify(data), auth: true })
  }
}

