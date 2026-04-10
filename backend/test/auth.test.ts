/**
 * Vercelplay Backend Test Suite
 * 
 * Tests all auth flows: register, verify, login
 * Run: bun run test/auth.test.ts
 * 
 * Prerequisites:
 *   - Backend running on http://localhost:4000
 *   - PostgreSQL and Redis running
 */

const API_BASE = process.env.API_BASE || 'http://localhost:4000'

// ─── Test Helpers ──────────────────────────────────────────────────────────────

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
  options?: RequestInit
): Promise<{ status: number; body: T; ok: boolean }> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const body = await response.json() as T
  return { status: response.status, body, ok: response.ok }
}

// ─── Redis Helper ──────────────────────────────────────────────────────────────

function createRedisClient() {
  const Redis = require('ioredis')
  return new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
}

/** Flush all rate limit keys so tests don't interfere with each other */
async function flushRateLimits() {
  try {
    const redis = createRedisClient()
    const keys = await redis.keys('rl:*')
    if (keys.length > 0) await redis.del(...keys)
    await redis.quit()
  } catch { /* non-critical */ }
}

// ─── Test Data ─────────────────────────────────────────────────────────────────

const TEST_USER = {
  name: 'Test User',
  email: `test-${Date.now()}@gmail.com`,
  password: 'SecureP@ss123',
}

// Store the user ID after registration for precise token lookup
let TEST_USER_ID: string | null = null

// ─── Tests ─────────────────────────────────────────────────────────────────────

async function testHealthCheck() {
  console.log('\n📋 Health Check')
  console.log('─'.repeat(60))

  try {
    const { status, body } = await apiCall<any>('/health')
    if (status === 200 && body.status === 'ok') {
      pass('GET /health returns 200 OK', { status: body.status })
    } else {
      fail('GET /health returns 200 OK', `Got status ${status}`, body)
    }
  } catch (e) {
    fail('GET /health returns 200 OK', `Server not reachable: ${e instanceof Error ? e.message : e}`)
  }
}

async function testApiRoot() {
  console.log('\n📋 API Root')
  console.log('─'.repeat(60))

  try {
    const { status, body } = await apiCall<any>('/')
    if (status === 200 && body.version) {
      pass('GET / returns API info', { version: body.version })
    } else {
      fail('GET / returns API info', `Unexpected response`, body)
    }
  } catch (e) {
    fail('GET / returns API info', `${e}`)
  }
}

// ─── Register Tests ────────────────────────────────────────────────────────────

async function testRegisterValidation() {
  console.log('\n📋 Register — Validation')
  console.log('─'.repeat(60))

  // Empty name
  {
    const { status, body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'test@test.com', password: 'password123' }),
    })
    if (status === 400 && !body.success && body.error?.code === 'INVALID_NAME') {
      pass('Empty name returns 400 INVALID_NAME', { code: body.error.code })
    } else {
      fail('Empty name returns 400 INVALID_NAME', `Status: ${status}`, body)
    }
  }

  // Short name
  {
    const { status, body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'A', email: 'test@test.com', password: 'password123' }),
    })
    if (status === 400 && body.error?.code === 'INVALID_NAME') {
      pass('Short name (1 char) returns 400 INVALID_NAME')
    } else {
      fail('Short name (1 char) returns 400 INVALID_NAME', `Status: ${status}`, body)
    }
  }

  // Invalid email
  {
    const { status, body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email: 'notanemail', password: 'password123' }),
    })
    if (status === 400 && body.error?.code === 'INVALID_EMAIL') {
      pass('Invalid email returns 400 INVALID_EMAIL')
    } else {
      fail('Invalid email returns 400 INVALID_EMAIL', `Status: ${status}`, body)
    }
  }

  // Short password
  {
    const { status, body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email: 'test@test.com', password: 'short' }),
    })
    if (status === 400 && body.error?.code === 'INVALID_PASSWORD') {
      pass('Short password returns 400 INVALID_PASSWORD')
    } else {
      fail('Short password returns 400 INVALID_PASSWORD', `Status: ${status}`, body)
    }
  }

  // Disposable email
  {
    const { status, body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test User', email: 'test@tempmail.com', password: 'password123' }),
    })
    if (status === 400 && body.error?.code === 'DISPOSABLE_EMAIL') {
      pass('Disposable email returns 400 DISPOSABLE_EMAIL')
    } else {
      fail('Disposable email returns 400 DISPOSABLE_EMAIL', `Status: ${status}`, body)
    }
  }
}

async function testRegisterSuccess(): Promise<boolean> {
  console.log('\n📋 Register — Success')
  console.log('─'.repeat(60))

  // Flush rate limits from validation tests
  await flushRateLimits()

  const { status, body } = await apiCall<any>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(TEST_USER),
  })

  if (status === 201 && body.success && body.data?.message) {
    pass('Register new user returns 201', { message: body.data.message })

    // Look up the user ID from Redis so we can find the correct token later
    try {
      const redis = createRedisClient()
      const keys = await redis.keys('verification:*')
      for (const key of keys) {
        const userId = await redis.get(key)
        if (userId) {
          // We'll verify the correct one in the verify test
          TEST_USER_ID = userId
        }
      }
      await redis.quit()
    } catch {
      // Non-critical — we'll try to find it later
    }

    return true
  } else {
    fail('Register new user returns 201', `Status: ${status}`, body)
    return false
  }
}

async function testRegisterDuplicate() {
  console.log('\n📋 Register — Duplicate')
  console.log('─'.repeat(60))

  const { status, body } = await apiCall<any>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(TEST_USER),
  })

  if (status === 409 && body.error?.code === 'EMAIL_EXISTS') {
    pass('Duplicate email returns 409 EMAIL_EXISTS')
  } else {
    fail('Duplicate email returns 409 EMAIL_EXISTS', `Status: ${status}`, body)
  }
}

// ─── Login Tests (Before Verify) ───────────────────────────────────────────────

async function testLoginBeforeVerify() {
  console.log('\n📋 Login — Before Email Verification')
  console.log('─'.repeat(60))

  {
    const { status, body } = await apiCall<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    })
    if (status === 403 && body.error?.code === 'USER_NOT_VERIFIED') {
      const hasResendMessage = body.error?.message?.includes('new verification link')
      pass('Unverified user login returns 403 + resends verification email', {
        resendMessagePresent: hasResendMessage,
      })
    } else {
      fail('Unverified user login returns 403 + resends verification email', `Status: ${status}`, body)
    }
  }
}

// ─── Login Validation Tests ────────────────────────────────────────────────────

async function testLoginValidation() {
  console.log('\n📋 Login — Validation')
  console.log('─'.repeat(60))

  // Flush rate limits from previous tests
  await flushRateLimits()

  // Invalid email
  {
    const { status, body } = await apiCall<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'notanemail', password: 'password123' }),
    })
    if (status === 400 && body.error?.code === 'INVALID_EMAIL') {
      pass('Invalid email returns 400 INVALID_EMAIL')
    } else {
      fail('Invalid email returns 400 INVALID_EMAIL', `Status: ${status}`, body)
    }
  }

  // Wrong password
  {
    const { status, body } = await apiCall<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USER.email, password: 'wrongpassword123' }),
    })
    if (status === 401 && body.error?.code === 'INVALID_CREDENTIALS') {
      pass('Wrong password returns 401 INVALID_CREDENTIALS')
    } else {
      fail('Wrong password returns 401 INVALID_CREDENTIALS', `Status: ${status}`, body)
    }
  }

  // Non-existent user
  {
    const { status, body } = await apiCall<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'nonexistent@example.com', password: 'password123' }),
    })
    if (status === 401 && body.error?.code === 'INVALID_CREDENTIALS') {
      pass('Non-existent user returns 401 INVALID_CREDENTIALS')
    } else {
      fail('Non-existent user returns 401 INVALID_CREDENTIALS', `Status: ${status}`, body)
    }
  }
}

// ─── Verify Tests ──────────────────────────────────────────────────────────────

async function testVerifyValidation() {
  console.log('\n📋 Verify — Validation')
  console.log('─'.repeat(60))

  // Invalid token (wrong length)
  {
    const { status, body } = await apiCall<any>('/auth/verify?token=short')
    if (status >= 400 && !body.success) {
      pass('Short token returns error', { code: body.error?.code, status })
    } else {
      fail('Short token returns error', `Status: ${status}`, body)
    }
  }

  // Expired/fake token (correct length = 64 hex chars)
  {
    const fakeToken = 'a'.repeat(64)
    const { status, body } = await apiCall<any>(`/auth/verify?token=${fakeToken}`)
    if (status === 410 && body.error?.code === 'TOKEN_EXPIRED') {
      pass('Fake 64-char token returns 410 TOKEN_EXPIRED')
    } else {
      fail('Fake 64-char token returns 410 TOKEN_EXPIRED', `Status: ${status}`, body)
    }
  }
}

// ─── Verify + Login Flow Test (via Redis) ──────────────────────────────────────

async function testVerifyAndLogin() {
  console.log('\n📋 Verify + Login — Full Flow (Register → Verify → Login)')
  console.log('─'.repeat(60))

  try {
    const redis = createRedisClient()

    // Find the verification token that belongs to our TEST_USER
    const keys = await redis.keys('verification:*')

    if (keys.length === 0) {
      fail('Find verification token in Redis', 'No verification tokens found in Redis')
      await redis.quit()
      return
    }

    // Find the token that maps to TEST_USER_ID
    let targetToken: string | null = null
    let targetUserId: string | null = null

    for (const key of keys) {
      const userId = await redis.get(key)
      const token = key.replace('verification:', '')

      // If we know the user ID, match precisely; otherwise take the last token
      if (TEST_USER_ID && userId === TEST_USER_ID) {
        targetToken = token
        targetUserId = userId
        break
      }
      // Fallback: keep the last one
      targetToken = token
      targetUserId = userId
    }

    if (!targetToken) {
      fail('Find verification token in Redis', 'Could not find matching token')
      await redis.quit()
      return
    }

    pass('Found verification token in Redis', {
      tokenPrefix: targetToken.substring(0, 8) + '...',
      userId: targetUserId,
      totalKeys: keys.length,
    })

    // Step 1: Verify the email
    {
      const { status, body } = await apiCall<any>(`/auth/verify?token=${targetToken}`)
      if (status === 200 && body.success && body.data?.message) {
        pass('Verify email returns 200 SUCCESS', { message: body.data.message })
      } else {
        fail('Verify email returns 200 SUCCESS', `Status: ${status}`, body)
        await redis.quit()
        return
      }
    }

    // Step 2: Try verify again (token consumed)
    {
      const { status, body } = await apiCall<any>(`/auth/verify?token=${targetToken}`)
      if (status >= 400 && !body.success) {
        pass('Re-verify returns error (token consumed)', { code: body.error?.code, status })
      } else {
        fail('Re-verify returns error (token consumed)', `Status: ${status}`, body)
      }
    }

    // Step 3: Login should now work
    {
      const { status, body } = await apiCall<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
      })
      if (status === 200 && body.success && body.data?.accessToken && body.data?.refreshToken) {
        pass('Login after verify returns 200 with JWT tokens', {
          hasAccessToken: !!body.data.accessToken,
          hasRefreshToken: !!body.data.refreshToken,
          tokenLength: body.data.accessToken.length,
        })

        // Step 4: GET /auth/me with the token
        const meResponse = await apiCall<any>('/auth/me', {
          headers: { 'Authorization': `Bearer ${body.data.accessToken}` },
        })
        if (
          meResponse.status === 200 &&
          meResponse.body.success &&
          meResponse.body.data?.name === TEST_USER.name &&
          meResponse.body.data?.email === TEST_USER.email &&
          meResponse.body.data?.isVerified === true
        ) {
          pass('GET /auth/me returns user profile', {
            name: meResponse.body.data.name,
            email: meResponse.body.data.email,
            isVerified: meResponse.body.data.isVerified,
          })
        } else {
          fail('GET /auth/me returns user profile', `Status: ${meResponse.status}`, meResponse.body)
        }
      } else {
        fail('Login after verify returns 200 with JWT tokens', `Status: ${status}`, body)
      }
    }

    await redis.quit()
  } catch (e) {
    fail('Verify + Login flow', `${e instanceof Error ? e.message : e}`)
  }
}

// ─── Response Format Tests ─────────────────────────────────────────────────────

async function testResponseFormat() {
  console.log('\n📋 Response Format')
  console.log('─'.repeat(60))

  // Success response format
  {
    const { body } = await apiCall<any>('/health')
    if (typeof body === 'object' && body.status === 'ok') {
      pass('Health check has correct format')
    } else {
      fail('Health check has correct format', 'Unexpected format', body)
    }
  }

  // Error response format: { success: false, error: { code, message } }
  {
    const { body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'bad', password: 'x' }),
    })
    if (
      typeof body === 'object' &&
      body.success === false &&
      typeof body.error === 'object' &&
      typeof body.error.code === 'string' &&
      typeof body.error.message === 'string'
    ) {
      pass('Error response has { success, error: { code, message } } format')
    } else {
      fail('Error response has { success, error: { code, message } } format', 'Bad format', body)
    }
  }

  // Success auth response format: { success: true, data: { ... } }
  {
    const { body } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Format Tester',
        email: `format-test-${Date.now()}@gmail.com`,
        password: 'password123',
      }),
    })
    if (
      typeof body === 'object' &&
      body.success === true &&
      typeof body.data === 'object'
    ) {
      pass('Success response has { success: true, data: {...} } format')
    } else {
      fail('Success response has { success: true, data: {...} } format', 'Bad format', body)
    }
  }
}

// ─── CORS Test ─────────────────────────────────────────────────────────────────

async function testCors() {
  console.log('\n📋 CORS')
  console.log('─'.repeat(60))

  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization',
      },
    })

    const acaoHeader = response.headers.get('access-control-allow-origin')
    if (acaoHeader) {
      pass('OPTIONS returns CORS headers', { 'access-control-allow-origin': acaoHeader })
    } else {
      fail('OPTIONS returns CORS headers', 'Missing access-control-allow-origin header')
    }
  } catch (e) {
    fail('OPTIONS returns CORS headers', `${e}`)
  }
}

// ─── Rate Limit Tests ──────────────────────────────────────────────────────────

async function testRateLimit() {
  console.log('\n📋 Rate Limiting')
  console.log('─'.repeat(60))

  // Exhaust register rate limit (5 requests allowed)
  // We already used some during tests, so let's just hammer until we get 429
  let got429 = false
  for (let i = 0; i < 10; i++) {
    const { status } = await apiCall<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'RL',
        email: `rl-test-${i}@test.com`,
        password: 'short', // Will fail validation before hitting DB
      }),
    })
    if (status === 429) {
      got429 = true
      break
    }
  }

  if (got429) {
    pass('Register rate limit returns 429 after threshold')
  } else {
    fail('Register rate limit returns 429 after threshold', 'Never got 429')
  }

  // Clean up rate limit keys so subsequent tests aren't affected
  try {
    const redis = createRedisClient()
    const rlKeys = await redis.keys('rl:*')
    if (rlKeys.length > 0) await redis.del(...rlKeys)
    await redis.quit()
  } catch { /* non-critical */ }
}

// ─── Run All Tests ─────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║         Vercelplay Backend Test Suite                       ║')
  console.log('║         Testing: Register -> Verify -> Login               ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log(`\n  API: ${API_BASE}`)
  console.log(`  User: ${TEST_USER.email}`)

  // --- Pre-test: clean up old test verification tokens + rate limit keys ---
  try {
    const redis = createRedisClient()
    const oldKeys = await redis.keys('verification:*')
    const rlKeys = await redis.keys('rl:*')
    const allKeys = [...oldKeys, ...rlKeys]
    if (allKeys.length > 0) {
      await redis.del(...allKeys)
      console.log(`\n  [Cleanup] Deleted ${allKeys.length} old tokens/rate-limit keys`)
    }
    await redis.quit()
  } catch {
    console.log('\n  [Cleanup] Could not clean Redis (non-critical)')
  }

  await testHealthCheck()
  await testApiRoot()
  await testRegisterValidation()
  const registered = await testRegisterSuccess()
  if (registered) {
    await testRegisterDuplicate()
  }
  await testLoginValidation()
  await testLoginBeforeVerify()
  await testVerifyValidation()
  await testVerifyAndLogin()
  await testRateLimit()
  await testResponseFormat()
  await testCors()

  // ─── Summary ───────────────────────────────────────────────────────────────

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
