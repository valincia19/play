import { db, users } from '../../schema'
import { eq, isNull } from 'drizzle-orm'
import { hashPassword, verifyPassword, generateVerificationToken } from '../../utils/crypto'
import { isValidEmail, isValidPassword, validateName, isDisposableEmail } from '../../utils/validation'
import { generateTokens, verifyToken, type JwtPayload } from '../../utils/jwt'
import { createHash } from 'crypto'
import { error, errorCodes } from '../../utils/response'
import { emailService } from '../../services/email.service'
import { logger, logEvents } from '../../utils/logger'
import { SecurityError, SECURITY_ERROR_CODES } from '../../utils/security-error'
import { redisManager } from '../../utils/redis'

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterResult {
  message: string
}

export interface LoginResult {
  accessToken: string
  refreshToken: string
}

export interface VerifyResult {
  message: string
}

export interface UserResult {
  id: string
  name: string
  email: string
  role: string
  plan: string 
  isVerified: boolean
  createdAt: Date
}

class AuthService {
  private readonly VERIFICATION_TOKEN_EXPIRY = 15 * 60 // 15 minutes in seconds

  constructor() {}

  async register(input: RegisterInput): Promise<RegisterResult> {
    logger.info({
      event: logEvents.USER_REGISTER,
      data: { email: input.email },
    })

    // Validate input
    const trimmedName = input.name.trim()
    const trimmedEmail = input.email.trim().toLowerCase()

    if (!validateName(trimmedName)) {
      logger.warn({
        event: logEvents.USER_REGISTER_FAILED,
        reason: 'invalid_name',
        data: { name: trimmedName },
      })
      throw error(errorCodes.INVALID_NAME, 'Name must be between 2 and 100 characters')
    }

    if (!isValidEmail(trimmedEmail)) {
      logger.warn({
        event: logEvents.USER_REGISTER_FAILED,
        reason: 'invalid_email',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.INVALID_EMAIL, 'Invalid email address')
    }

    if (!isValidPassword(input.password)) {
      logger.warn({
        event: logEvents.USER_REGISTER_FAILED,
        reason: 'invalid_password',
        data: { passwordLength: input.password.length },
      })
      throw error(errorCodes.INVALID_PASSWORD, 'Password must be at least 6 characters')
    }

    if (isDisposableEmail(trimmedEmail)) {
      logger.warn({
        event: logEvents.USER_REGISTER_FAILED,
        reason: 'disposable_email',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.DISPOSABLE_EMAIL, 'Disposable email addresses are not allowed')
    }

    // Check if email already exists
    const existingUser = await db.select().from(users).where(eq(users.email, trimmedEmail)).limit(1)
    if (existingUser.length > 0) {
      logger.warn({
        event: logEvents.USER_REGISTER_FAILED,
        reason: 'email_exists',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.EMAIL_EXISTS, 'Email address already registered')
    }

    // Hash password
    const passwordHash = await hashPassword(input.password)

    // Create user
    const newUser = await db
      .insert(users)
      .values({
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        isVerified: false,
      })
      .returning()

    const createdUser = newUser[0]
    if (!createdUser) {
      logger.error({
        event: logEvents.DATABASE_ERROR,
        message: 'Failed to create user',
      })
      throw error(errorCodes.INTERNAL_ERROR, 'Failed to create user')
    }

    logger.info({
      event: logEvents.USER_REGISTER_SUCCESS,
      data: { userId: createdUser.id, email: trimmedEmail },
    })

    // Generate verification token
    const token = generateVerificationToken()
    const tokenKey = `verification:${token}`

    // Store token in Redis with expiry
    try {
      await redisManager.set(tokenKey, createdUser.id, this.VERIFICATION_TOKEN_EXPIRY)
    } catch (redisError) {
      logger.warn({
        event: logEvents.REDIS_ERROR,
        message: 'Failed to store verification token in Redis',
        data: { error: redisError instanceof Error ? redisError.message : String(redisError) },
      })
    }

    // Send verification email
    try {
      await emailService.sendVerificationEmail(trimmedEmail, trimmedName, token)

      logger.info({
        event: logEvents.EMAIL_SEND_SUCCESS,
        data: { to: trimmedEmail, userId: createdUser.id },
      })
    } catch (emailError) {
      logger.error({
        event: logEvents.EMAIL_SEND_FAILED,
        message: 'Failed to send verification email',
        error: {
          message: emailError instanceof Error ? emailError.message : String(emailError),
          name: 'EmailSendError',
          stack: emailError instanceof Error ? emailError.stack : undefined,
        },
      })

      throw error(errorCodes.INTERNAL_ERROR, 'Failed to send verification email. Please try again later.')
    }

    return { message: 'Registration successful. Please check your email to verify your account.' }
  }

  async verify(token: string): Promise<VerifyResult> {
    logger.info({
      event: logEvents.USER_VERIFY_EMAIL,
      data: { token: token.substring(0, 8) + '...' },
    })

    if (!token || typeof token !== 'string' || token.length !== 6) {
      logger.warn({
        event: logEvents.USER_VERIFY_FAILED,
        reason: 'invalid_token',
        data: { tokenLength: token.length },
      })
      throw error(errorCodes.INVALID_TOKEN, 'Invalid verification token')
    }

    const tokenKey = `verification:${token}`

    // Get user ID from Redis (stored via JSON.stringify, so parse it back)
    const redis = await redisManager.getClient()
    const rawValue = await redis.get(tokenKey)
    if (!rawValue) {
      logger.warn({
        event: logEvents.USER_VERIFY_FAILED,
        reason: 'token_expired',
        data: { tokenKey },
      })
      throw error(errorCodes.TOKEN_EXPIRED, 'Verification token has expired or is invalid')
    }
    const userId = JSON.parse(rawValue) as string

    // Find user
    const foundUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const user = foundUsers[0]
    if (!user) {
      logger.warn({
        event: logEvents.USER_VERIFY_FAILED,
        reason: 'user_not_found',
        data: { userId },
      })
      throw error(errorCodes.USER_NOT_FOUND, 'User not found')
    }

    // Check if already verified
    if (user.isVerified) {
      // Still delete token
      await redisManager.del(tokenKey)

      logger.warn({
        event: logEvents.USER_VERIFY_FAILED,
        reason: 'already_verified',
        data: { userId, email: user.email },
      })
      throw error(errorCodes.INVALID_TOKEN, 'Email already verified')
    }

    // Mark user as verified
    await db.update(users).set({ isVerified: true }).where(eq(users.id, userId))

    // Delete token
    await redisManager.del(tokenKey)

    logger.info({
      event: logEvents.USER_VERIFY_SUCCESS,
      data: { userId, email: user.email },
    })

    return { message: 'Email verified successfully. You can now log in.' }
  }

  async login(input: LoginInput): Promise<LoginResult> {
    logger.info({
      event: logEvents.USER_LOGIN,
      data: { email: input.email },
    })

    const trimmedEmail = input.email.trim().toLowerCase()

    if (!isValidEmail(trimmedEmail)) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'invalid_email',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.INVALID_EMAIL, 'Invalid email address')
    }

    if (!input.password || input.password.length < 1) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'invalid_password',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.INVALID_PASSWORD, 'Password is required')
    }

    // Find user by email
    const foundUsers = await db.select().from(users).where(eq(users.email, trimmedEmail)).limit(1)
    const user = foundUsers[0]
    if (!user) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'user_not_found',
        data: { emailHash: createHash('sha256').update(trimmedEmail).digest('hex').substring(0, 8) },
      })

      // Log security event
      SecurityError.logAuthSecurity('login_failed', {
        ip: 'unknown',
        email: trimmedEmail,
        action: 'login',
        success: false,
        reason: 'user_not_found'
      })

      throw error(errorCodes.INVALID_CREDENTIALS, SECURITY_ERROR_CODES.INVALID_CREDENTIALS)
    }

    if (user.deletedAt) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'account_deleted',
        data: { email: trimmedEmail },
      })
      throw error(errorCodes.ACCOUNT_DELETED, 'Account has been deleted')
    }

    // Verify password
    const isPasswordValid = await verifyPassword(input.password, user.passwordHash)
    if (!isPasswordValid) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'wrong_password',
        data: { emailHash: createHash('sha256').update(trimmedEmail).digest('hex').substring(0, 8) },
      })

      // Log security event
      SecurityError.logAuthSecurity('login_failed', {
        ip: 'unknown',
        email: trimmedEmail,
        action: 'login',
        success: false,
        reason: 'wrong_password'
      })

      throw error(errorCodes.INVALID_CREDENTIALS, SECURITY_ERROR_CODES.INVALID_CREDENTIALS)
    }

    // Check if verified — resend verification email if not
    if (!user.isVerified) {
      logger.warn({
        event: logEvents.USER_LOGIN_FAILED,
        reason: 'not_verified',
        data: { userId: user.id, email: user.email },
      })

      // Auto-resend verification email
      try {
        const token = generateVerificationToken()
        const tokenKey = `verification:${token}`
        await redisManager.set(tokenKey, user.id, this.VERIFICATION_TOKEN_EXPIRY)
        await emailService.sendVerificationEmail(user.email, user.name, token)

        logger.info({
          event: 'verification_resent',
          data: { userId: user.id, email: user.email },
        })
      } catch (resendError) {
        logger.error({
          event: logEvents.EMAIL_SEND_FAILED,
          message: 'Failed to resend verification email on login',
          error: {
            message: resendError instanceof Error ? resendError.message : String(resendError),
            name: 'VerificationResendError',
          },
        })
      }

      throw error(
        errorCodes.USER_NOT_VERIFIED,
        'Your email is not verified. A new verification link has been sent to your email.'
      )
    }

    // Generate tokens
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
    })

    logger.info({
      event: logEvents.USER_LOGIN_SUCCESS,
      data: { userId: user.id, email: user.email },
    })

    return tokens
  }

  async getUserById(userId: string): Promise<UserResult | null> {
    const foundUsers = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    const user = foundUsers[0]
    if (!user || user.deletedAt) {
      return null
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    }
  }

  async getAllUsers(): Promise<UserResult[]> {
    const allUsers = await db.select().from(users).where(isNull(users.deletedAt))
    return allUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    }))
  }

  async verifyJwtToken(token: string): Promise<JwtPayload | null> {
    return verifyToken(token)
  }

  async updateUser(userId: string, data: { name?: string }): Promise<UserResult | null> {
    const updateData: Partial<typeof users.$inferInsert> = {}
    
    if (data.name) {
      if (!validateName(data.name.trim())) {
        throw error(errorCodes.INVALID_NAME, 'Name must be between 2 and 100 characters')
      }
      updateData.name = data.name.trim()
    }

    if (Object.keys(updateData).length === 0) {
      return this.getUserById(userId)
    }

    const result = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning()
    
    const updatedUser = result[0]
    if (!updatedUser) return null
    
    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      plan: updatedUser.plan,
      isVerified: updatedUser.isVerified,
      createdAt: updatedUser.createdAt,
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await db.update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id })
    return result.length > 0
  }
}

export const authService = new AuthService()
