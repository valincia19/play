/**
 * Frontend Configuration System
 * Validates environment variables at startup to prevent silent failures.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    const msg = `❌ Missing required environment variable: ${name}. Please check your .env file.`
    console.error(msg)
    // In production, we don't want to crash the whole UI, but we want it to be very visible
    return '' 
  }
  return value.trim()
}

export const config = {
  apiBaseUrl: requireEnv('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  appUrl: requireEnv('VITE_APP_URL', import.meta.env.VITE_APP_URL),
  frontendUrl: requireEnv('VITE_FRONTEND_URL', import.meta.env.VITE_FRONTEND_URL),
  shareDomain: requireEnv('VITE_SHARE_DOMAIN', import.meta.env.VITE_SHARE_DOMAIN),
  mainDomain: requireEnv('VITE_MAIN_DOMAIN', import.meta.env.VITE_MAIN_DOMAIN),
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
}

// Global check for critical variables
if (!config.apiBaseUrl) {
  alert('Critical Configuration Error: VITE_API_BASE_URL is missing. The app will not function correctly.')
}
