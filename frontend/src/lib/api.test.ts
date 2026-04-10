import { api, ApiError } from './api'

async function testApi() {
  console.log('=== Frontend API Integration Test ===\n')

  // Test 1: Register a new user
  console.log('Test 1: Registering new user...')
  try {
    const registerResult = await api.register({
      name: 'Frontend Test User',
      email: 'frontend@example.com',
      password: 'securepass123',
    })
    console.log('✅ Register Success:', registerResult.message)
    console.log('   Check server console for email verification token...')
  } catch (err) {
    if (err instanceof ApiError) {
      console.error('❌ Register Failed:', err.code, '-', err.message)
    } else {
      console.error('❌ Register Failed:', err)
    }
  }

  // Test 2: Try duplicate registration
  console.log('\nTest 2: Trying duplicate registration...')
  try {
    await api.register({
      name: 'Duplicate User',
      email: 'frontend@example.com',
      password: 'anotherpass123',
    })
    console.log('❌ Should have been rejected')
  } catch (err) {
    if (err instanceof ApiError) {
      console.log('✅ Duplicate rejected correctly:', err.code, '-', err.message)
    } else {
      console.error('❌ Unexpected error:', err)
    }
  }

  // Test 3: Register with disposable email
  console.log('\nTest 3: Trying disposable email...')
  try {
    await api.register({
      name: 'Test User',
      email: 'test@tempmail.com',
      password: 'securepass123',
    })
    console.log('❌ Should have been rejected')
  } catch (err) {
    if (err instanceof ApiError) {
      console.log('✅ Disposable rejected correctly:', err.code, '-', err.message)
    } else {
      console.error('❌ Unexpected error:', err)
    }
  }

  console.log('\n=== Test Complete ===')
  console.log('\nTo test full flow:')
  console.log('1. Visit http://localhost:5173/register')
  console.log('2. Check server console for verification link')
  console.log('3. Copy the verification link from server console')
  console.log('4. Visit: http://localhost:5173/login')
  console.log('5. Login with verified credentials')
}

// Run tests
testApi()
