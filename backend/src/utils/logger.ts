import pino from 'pino'

const isDevelopment = process.env.NODE_ENV === 'development'

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    ...(isDevelopment
      ? {}
      : {
          formatters: {
            level: (label: string) => ({ label }),
          },
          messageKey: 'msg',
        }),
  },
  isDevelopment
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      })
    : undefined
)

export const logEvents = {
  USER_REGISTER: 'user_register',
  USER_REGISTER_SUCCESS: 'user_register_success',
  USER_REGISTER_FAILED: 'user_register_failed',
  USER_VERIFY_EMAIL: 'user_verify_email',
  USER_VERIFY_SUCCESS: 'user_verify_success',
  USER_VERIFY_FAILED: 'user_verify_failed',
  USER_LOGIN: 'user_login',
  USER_LOGIN_SUCCESS: 'user_login_success',
  USER_LOGIN_FAILED: 'user_login_failed',
  EMAIL_SEND_START: 'email_send_start',
  EMAIL_SEND_SUCCESS: 'email_send_success',
  EMAIL_SEND_FAILED: 'email_send_failed',
  EMAIL_SMTP_NOT_CONFIGURED: 'email_smtp_not_configured',
  SERVER_START: 'server_start',
  SERVER_ERROR: 'server_error',
  DATABASE_ERROR: 'database_error',
  REDIS_ERROR: 'redis_error',
}

export const logUserEvent = (event: string, data?: Record<string, any>) => {
  logger.info({ event, ...data })
}

export const logEmailEvent = (event: string, data?: Record<string, any>) => {
  if (event === logEvents.EMAIL_SEND_FAILED) {
    logger.error({ event, ...data })
  } else {
    logger.info({ event, ...data })
  }
}

export const logSystemEvent = (event: string, data?: Record<string, any>) => {
  if (
    event === logEvents.SERVER_ERROR ||
    event === logEvents.DATABASE_ERROR ||
    event === logEvents.REDIS_ERROR
  ) {
    logger.error({ event, ...data })
  } else {
    logger.info({ event, ...data })
  }
}

export const logAuthError = (context: string, error: Error) => {
  logger.error({
    event: logEvents.SERVER_ERROR,
    context,
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack,
    },
  })
}
