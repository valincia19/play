// Security configuration constants

export const SECURITY = {
  // Rate limiting
  RATE_LIMITS: {
    // General endpoints
    GENERAL: {
      windowMs: 10000, // 10 seconds
      max: 150, // 150 requests per window
    },
    // Sensitive endpoints (auth, etc.)
    SENSITIVE: {
      windowMs: 30000, // 30 seconds
      max: 5, // 5 attempts per window
    },
    // Email verification
    EMAIL_VERIFY: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 verification requests per hour
    },
    // Password reset
    PASSWORD_RESET: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 reset requests per hour
    }
  },

  // Password policy
  PASSWORD_POLICY: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
    allowedSpecialChars: '!@#$%^&*(),.?":{}|<>',
    commonPasswords: [
      'password', '12345678', 'qwerty', 'password123',
      'admin', 'letmein', 'welcome', 'monkey',
      '123456789', 'sunshine', 'password1'
    ]
  },

  // CORS settings
  CORS: {
    allowedOrigins: ['http://localhost:5173'], // Frontend URL
    allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400 // 24 hours
  },

  // Session settings
  SESSION: {
    accessTokenExpiresIn: 7 * 24 * 60 * 60 * 1000, // 7 days
    refreshTokenExpiresIn: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxSessionsPerUser: 5, // Maximum concurrent sessions
    sessionInactivityTimeout: 30 * 60 * 1000, // 30 minutes
  },

  // Security headers
  HEADERS: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-src 'none'"
  },

  // File upload limits
  UPLOAD: {
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB (5 * 1024 * 1024 bytes)
    allowedFileTypes: [
      'video/mp4', 'video/webm', 'video/quicktime',
      'video/x-msvideo', 'video/x-matroska'
    ],
    allowedExtensions: ['.mp4', '.webm', '.mov', '.avi', '.mkv'],
    maxFiles: 10 // Maximum files per upload
  },

  // Brute force protection
  BRUTE_FORCE: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    lockoutAttempts: 10 // After 10 failed attempts
  },

  // Content validation
  VALIDATION: {
    emailMaxLength: 254,
    nameMinLength: 2,
    nameMaxLength: 100,
    passwordMinLength: 12,
    titleMaxLength: 100,
    descriptionMaxLength: 5000
  },

  // Security logging
  LOGGING: {
    sensitiveFields: ['password', 'token', 'secret', 'key', 'creditCard'],
    logUserAgents: false, // Set to false to log truncated user agents
    logIps: false, // Set to false to log hashed IPs
    sensitiveDataPattern: /password|token|secret|key/i
  }
}

// Security middleware configuration
export const securityMiddlewareConfig = {
  // Enable security headers in all environments
  headers: {
    enabled: true,
    productionOnly: false
  },

  // HTTPS enforcement
  httpsEnforcement: {
    enabled: process.env.NODE_ENV === 'production',
    productionOnly: true,
    statusCode: 301
  },

  // Request size limits
  requestSizeLimits: {
    enabled: true,
    maxSizeMB: 10, // 10MB for regular requests
    uploadMaxSizeMB: 5500 // 5.5GB for uploads
  },

  // Error message sanitization
  errorSanitization: {
    enabled: true,
    internalDetails: true, // Log internal details for debugging
    genericMessages: true // Send generic messages to users
  }
}