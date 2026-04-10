import { logger } from '../utils/logger'

export interface EmailConfig {
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  smtpFrom?: string
  fromName?: string
}

class EmailService {
  private config: EmailConfig
  private transporter: any = null
  private readonly SMTP_CONFIGURED: boolean

  constructor(config: EmailConfig = {}) {
    this.SMTP_CONFIGURED = !!process.env.SMTP_HOST

    this.config = {
      smtpHost: config.smtpHost || process.env.SMTP_HOST,
      smtpPort: config.smtpPort || Number(process.env.SMTP_PORT) || 587,
      smtpUser: config.smtpUser || process.env.SMTP_USER,
      smtpPassword: config.smtpPassword || process.env.SMTP_PASSWORD,
      smtpFrom: config.smtpFrom || process.env.SMTP_FROM,
      fromName: config.fromName || process.env.SMTP_FROM_NAME,
    }

    this.initializeTransporter()
  }

  private initializeTransporter(): void {
    if (!this.SMTP_CONFIGURED) {
      logger.info({
        event: 'email_smtp_not_configured',
        message: 'SMTP not configured — emails will be logged to console only',
      })
      return
    }

    // Validate required SMTP config
    if (!this.config.smtpUser || !this.config.smtpPassword) {
      logger.error({
        event: 'email_smtp_config_error',
        message: 'SMTP_USER and SMTP_PASSWORD are required when SMTP_HOST is set',
      })
      return
    }

    try {
      const nodemailer = require('nodemailer')
      this.transporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: this.config.smtpUser,
          pass: this.config.smtpPassword,
        },
      })

      logger.info({
        event: 'email_smtp_initialized',
        data: {
          host: this.config.smtpHost,
          port: this.config.smtpPort,
          user: this.config.smtpUser,
          from: this.config.smtpFrom,
        },
      })

      // Verify SMTP connection on startup (non-blocking)
      this.verifyConnection()
    } catch (e) {
      logger.error({
        event: 'email_smtp_init_failed',
        error: {
          message: e instanceof Error ? e.message : String(e),
          name: 'EmailInitError',
          stack: e instanceof Error ? e.stack : undefined,
        },
      })
      // Don't throw — fall back to console logging
      this.transporter = null
    }
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify()
      logger.info({
        event: 'email_smtp_connected',
        message: 'SMTP connection verified successfully',
      })
    } catch (e) {
      logger.error({
        event: 'email_smtp_connection_failed',
        message: 'SMTP connection verification failed — emails will be logged to console',
        error: {
          message: e instanceof Error ? e.message : String(e),
          name: 'SMTPVerifyError',
        },
      })
      // Reset transporter so emails fall back to console logging
      this.transporter = null
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    // Rate limit: max 3 emails per address per 15 min
    try {
      const { checkRateLimit, EMAIL_LIMIT } = require('../middleware/rate-limit')
      const emailLimit = await checkRateLimit(EMAIL_LIMIT, email.toLowerCase())
      if (!emailLimit.allowed) {
        logger.warn({
          event: 'email_rate_limited',
          data: {
            to: email,
            resetIn: emailLimit.resetIn,
            max: emailLimit.total,
          },
        })
        throw new Error(
          `Too many verification emails sent to ${email}. Please wait ${Math.ceil(emailLimit.resetIn / 60)} minutes.`
        )
      }
    } catch (rateLimitError) {
      // If it's our rate limit message, re-throw it
      if (rateLimitError instanceof Error && rateLimitError.message.includes('Too many')) {
        throw rateLimitError
      }
      // If rate limit check itself fails (Redis down), allow the email (fail-open)
      logger.warn({
        event: 'email_rate_limit_check_failed',
        error: { message: rateLimitError instanceof Error ? rateLimitError.message : String(rateLimitError) },
      })
    }

    const appUrl = process.env.APP_URL
    if (!appUrl) {
      logger.error({
        event: 'email_send_failed',
        error: {
          message: 'APP_URL environment variable is required for verification links',
          name: 'MissingEnv',
        },
      })
      throw new Error('APP_URL environment variable is required')
    }

    const verificationUrl = `${appUrl}/verify?token=${token}`
    const subject = 'Verify your email address'
    const html = this.getVerificationTemplate(name, verificationUrl)

    logger.info({
      event: 'email_send_attempt',
      data: {
        to: email,
        subject,
        verificationUrl,
        transporterAvailable: !!this.transporter,
      },
    })

    if (!this.transporter) {
      // Console logging when SMTP not configured or connection failed
      logger.warn({
        event: 'email_send_console_fallback',
        message: 'SMTP transporter not available — logging email to console',
      })
      this.logToConsole(email, subject, verificationUrl)
      return
    }

    try {
      const info = await this.transporter.sendMail({
        from: {
          name: this.config.fromName || 'Vercelplay',
          address: this.config.smtpFrom || 'noreply@vercelplay.com',
        },
        to: email,
        subject,
        html,
      })

      logger.info({
        event: 'email_send_success',
        data: {
          to: email,
          messageId: info.messageId,
          response: info.response,
          accepted: info.accepted,
          rejected: info.rejected,
        },
      })

      // Check if the email was rejected by the SMTP server
      if (info.rejected && info.rejected.length > 0) {
        logger.error({
          event: 'email_send_rejected',
          data: {
            to: email,
            rejected: info.rejected,
            response: info.response,
          },
        })
        throw new Error(`Email was rejected by SMTP server: ${info.rejected.join(', ')}`)
      }
    } catch (e) {
      logger.error({
        event: 'email_send_failed',
        error: {
          message: e instanceof Error ? e.message : String(e),
          name: e instanceof Error ? e.name : 'EmailSendError',
          stack: e instanceof Error ? e.stack : undefined,
        },
        data: {
          to: email,
          smtpHost: this.config.smtpHost,
        },
      })
      throw new Error(`Failed to send verification email: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private logToConsole(email: string, subject: string, verificationUrl: string): void {
    logger.info({
      event: 'email_dev_fallback',
      to: email,
      subject,
      verificationUrl,
      message: 'SMTP not available — copy the verification URL to verify manually',
    })
  }

  private getVerificationTemplate(name: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 20px; border-radius: 8px;">
    <tr>
      <td style="text-align: center; padding: 20px 0;">
        <h1 style="color: #333333; margin: 0;">Welcome to Vercelplay!</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 0;">
        <p style="color: #555555; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #555555; line-height: 1.6;">Thank you for signing up! Please verify your email address to activate your account.</p>
        <table style="margin: 20px 0;">
          <tr>
            <td style="background-color: #007bff; border-radius: 4px;">
              <a href="${verificationUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: bold;">Verify Email</a>
            </td>
          </tr>
        </table>
        <p style="color: #555555; line-height: 1.6;">Or copy and paste this link into your browser:</p>
        <p style="color: #007bff; word-break: break-all;">${verificationUrl}</p>
        <p style="color: #555555; line-height: 1.6; margin-top: 30px;">This link will expire in 15 minutes.</p>
        <p style="color: #555555; line-height: 1.6;">If you didn't create an account, please ignore this email.</p>
      </td>
    </tr>
    <tr>
      <td style="text-align: center; padding: 20px 0; border-top: 1px solid #eeeeee; color: #888888; font-size: 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} Vercelplay. All rights reserved.</p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim()
  }
}

export const emailService = new EmailService()
