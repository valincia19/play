/**
 * Vercelplay Video Upload Test Suite
 *
 * Tests critical video upload flows: quota, prepare, confirm, abort
 * Run: bun run test/video-upload.test.ts
 *
 * Prerequisites:
 *   - Backend running on http://localhost:4000
 *   - PostgreSQL and Redis running
 *   - Test user exists (registered + verified)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4000'

// ─── Test Helpers ──────────────────────────────────────────────────────

interface TestResult {
  name: string
  passed: boolean
  error?: string
  details?: Record<string, unknown>
}

const results: TestResult[] = []

function pass(name: string, details?: Record<string, unknown>) {
  results.push({ name, passed: true, details })
  console.log(`  ✅ ${name}`)
  if (details) console.log(`     ${JSON.stringify(details)}`)
}

function fail(name: string, error: string, details?: Record<string, unknown>) {
  results.push({ name, passed: false, error, details })
  console.error(`  ❌ ${name}`)
  console.error(`     Error: ${error}`)
  if (details) console.error(`     ${JSON.stringify(details)}`)
}

async function apiCall<T = any>(
  endpoint: string,
  options?: RequestInit & { auth?: boolean }
): Promise<{ status: number; body: T; ok: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  if (options?.auth && AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })
  const body = await response.json() as T
  return { status: response.status, body, ok: response.ok }
}

// ─── Auth Setup ────────────────────────────────────────────────────────

let AUTH_TOKEN: string | null = null

const TEST_EMAIL = `video-test-${Date.now()}@gmail.com`
const TEST_PASSWORD = 'VideoTest123'

async function ensureTestUser() {
  console.log('\n📋 Setup — Create & Verify Test User')
  console.log('─'.repeat(60))

  // Register
  const reg = await apiCall('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Video Tester', email: TEST_EMAIL, password: TEST_PASSWORD }),
  })

  if (!reg.ok && reg.body?.error?.code !== 'EMAIL_EXISTS') {
    fail('Register test user', `Status: ${reg.status}`, reg.body)
    return false
  }
  pass('Registered test user (or already exists)')

  // Auto-verify via Redis
  try {
    const Redis = require('ioredis')
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const keys = await redis.keys('verification:*')
    for (const key of keys) {
      const token = key.replace('verification:', '')
      await fetch(`${API_BASE}/auth/verify?token=${token}`)
    }
    await redis.quit()
    pass('Auto-verified test user')
  } catch (e) {
    fail('Auto-verify test user', `${e}`)
  }

  // Login
  const login = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })

  if (login.ok && login.body?.data?.accessToken) {
    AUTH_TOKEN = login.body.data.accessToken
    pass('Logged in test user')
    return true
  }

  fail('Login test user', `Status: ${login.status}`, login.body)
  return false
}

// ─── Tests ─────────────────────────────────────────────────────────────

async function testStorageUsage() {
  console.log('\n📋 GET /videos/storage-usage')
  console.log('─'.repeat(60))

  const { status, body } = await apiCall('/videos/storage-usage', { auth: true })

  if (status === 200 && body.success && body.data) {
    pass('Returns storage usage', {
      usedMB: body.data.usedMB,
      maxMB: body.data.maxMB,
    })
  } else {
    fail('Returns storage usage', `Status: ${status}`, body)
  }
}

async function testQueueStatus() {
  console.log('\n📋 GET /videos/queue-status')
  console.log('─'.repeat(60))

  const { status, body } = await apiCall('/videos/queue-status', { auth: true })

  if (status === 200 && body.success && body.data) {
    pass('Returns queue status', body.data)
  } else {
    fail('Returns queue status', `Status: ${status}`, body)
  }
}

async function testListVideos() {
  console.log('\n📋 GET /videos')
  console.log('─'.repeat(60))

  // Root folder (no folderId)
  const { status, body } = await apiCall('/videos', { auth: true })

  if (status === 200 && body.success && Array.isArray(body.data?.videos)) {
    pass('Returns video list with pagination', {
      count: body.data.videos.length,
      total: body.data.total,
      hasMore: body.data.hasMore,
    })
  } else {
    fail('Returns video list', `Status: ${status}`, body)
  }

  // With pagination
  const { status: pStatus } = await apiCall('/videos?limit=5&offset=0', { auth: true })
  if (pStatus === 200) {
    pass('Pagination parameters accepted')
  } else {
    fail('Pagination parameters accepted', `Status: ${pStatus}`)
  }

  // With folderId
  const { status: fStatus } = await apiCall('/videos?folderId=nonexistent', { auth: true })
  if (fStatus === 200) {
    pass('FolderId parameter accepted')
  } else {
    fail('FolderId parameter accepted', `Status: ${fStatus}`)
  }
}

async function testBandwidthUsage() {
  console.log('\n📋 GET /videos/bandwidth-usage')
  console.log('─'.repeat(60))

  const { status, body } = await apiCall('/videos/bandwidth-usage', { auth: true })

  if (status === 200 && body.success && body.data) {
    pass('Returns bandwidth usage', {
      usedMB: body.data.usedMB,
      maxMB: body.data.maxMB,
      percent: body.data.percent,
    })
  } else {
    fail('Returns bandwidth usage', `Status: ${status}`, body)
  }
}

async function testPrepareUploadValidation() {
  console.log('\n📋 POST /videos/prepare-upload — Validation')
  console.log('─'.repeat(60))

  // Missing required fields
  {
    const { status, body } = await apiCall('/videos/prepare-upload', {
      method: 'POST',
      body: JSON.stringify({}),
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Missing fields returns error', { code: body.error?.code })
    } else {
      fail('Missing fields returns error', `Status: ${status}`, body)
    }
  }

  // Invalid file type
  {
    const { status, body } = await apiCall('/videos/prepare-upload', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Video',
        fileType: 'text/plain',
        fileSizeBytes: 1024,
        processingMode: 'mp4',
      }),
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Invalid file type returns error')
    } else {
      fail('Invalid file type returns error', `Status: ${status}`, body)
    }
  }

  // Negative file size
  {
    const { status, body } = await apiCall('/videos/prepare-upload', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Video',
        fileType: 'video/mp4',
        fileSizeBytes: -1,
        processingMode: 'mp4',
      }),
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Negative file size returns error')
    } else {
      fail('Negative file size returns error', `Status: ${status}`, body)
    }
  }
}

async function testConfirmUploadValidation() {
  console.log('\n📋 POST /videos/:id/confirm-upload — Validation')
  console.log('─'.repeat(60))

  // Non-existent video
  {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { status, body } = await apiCall(`/videos/${fakeId}/confirm-upload`, {
      method: 'POST',
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Non-existent video returns error')
    } else {
      fail('Non-existent video returns error', `Status: ${status}`, body)
    }
  }
}

async function testAbortUploadValidation() {
  console.log('\n📋 POST /videos/:id/abort-upload — Validation')
  console.log('─'.repeat(60))

  // Non-existent video
  {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const { status, body } = await apiCall(`/videos/${fakeId}/abort-upload`, {
      method: 'POST',
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Non-existent video returns error')
    } else {
      fail('Non-existent video returns error', `Status: ${status}`, body)
    }
  }
}

async function testVideoUpdateValidation() {
  console.log('\n📋 PATCH /videos/:id — Validation')
  console.log('─'.repeat(60))

  const fakeId = '00000000-0000-0000-0000-000000000000'

  // Non-existent video
  {
    const { status, body } = await apiCall(`/videos/${fakeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated' }),
      auth: true,
    })
    if (status === 404 && body.error?.code === 'NOT_FOUND') {
      pass('Non-existent video returns 404 NOT_FOUND')
    } else {
      fail('Non-existent video returns 404 NOT_FOUND', `Status: ${status}`, body)
    }
  }

  // Invalid visibility
  {
    const { status, body } = await apiCall(`/videos/${fakeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ visibility: 'invalid' }),
      auth: true,
    })
    if (status >= 400 && !body.success) {
      pass('Invalid visibility returns error')
    } else {
      fail('Invalid visibility returns error', `Status: ${status}`, body)
    }
  }
}

async function testVideoDeleteValidation() {
  console.log('\n📋 DELETE /videos/:id — Validation')
  console.log('─'.repeat(60))

  const fakeId = '00000000-0000-0000-0000-000000000000'

  {
    const { status, body } = await apiCall(`/videos/${fakeId}`, {
      method: 'DELETE',
      auth: true,
    })
    if (status === 404 && body.error?.code === 'NOT_FOUND') {
      pass('Non-existent video returns 404 NOT_FOUND')
    } else {
      fail('Non-existent video returns 404 NOT_FOUND', `Status: ${status}`, body)
    }
  }
}

async function testUnauthenticatedAccess() {
  console.log('\n📋 Unauthenticated Access')
  console.log('─'.repeat(60))

  const endpoints = [
    { method: 'GET', path: '/videos' },
    { method: 'GET', path: '/videos/storage-usage' },
    { method: 'GET', path: '/videos/queue-status' },
    { method: 'GET', path: '/videos/bandwidth-usage' },
    { method: 'POST', path: '/videos/prepare-upload' },
  ]

  for (const { method, path } of endpoints) {
    const { status } = await apiCall(path, { method })
    if (status === 401) {
      pass(`${method} ${path} returns 401 without auth`)
    } else {
      fail(`${method} ${path} returns 401 without auth`, `Got ${status}`)
    }
  }
}

// ─── Run All Tests ─────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         Vercelplay Video Upload Test Suite                  ║')
  console.log('║         Testing: Upload, Quota, Validation                  ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n  API: ${API_BASE}`)

  // Setup auth
  const authed = await ensureTestUser()
  if (!authed) {
    console.error('\n  ⚠️  Cannot proceed without auth — aborting')
    process.exit(1)
  }

  // Run tests
  await testUnauthenticatedAccess()
  await testStorageUsage()
  await testQueueStatus()
  await testBandwidthUsage()
  await testListVideos()
  await testPrepareUploadValidation()
  await testConfirmUploadValidation()
  await testAbortUploadValidation()
  await testVideoUpdateValidation()
  await testVideoDeleteValidation()

  // ─── Summary ────────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60))
  console.log('  TEST SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length

  console.log(`  Total:  ${total}`)
  console.log(`  Passed: ${passed}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Rate:   ${total > 0 ? Math.round((passed / total) * 100) : 0}%`)

  if (failed > 0) {
    console.log('\n  Failed tests:')
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    FAIL: ${r.name}: ${r.error}`)
    }
  }

  console.log('\n' + '='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Test suite crashed:', e)
  process.exit(1)
})