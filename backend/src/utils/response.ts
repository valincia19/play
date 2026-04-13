export interface SuccessResponse<T = unknown> {
  success: true
  data: T
}

export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

export function success<T>(data: T): SuccessResponse<T> {
  return { success: true, data }
}

export function error(code: string, message: string): ErrorResponse {
  return { success: false, error: { code, message } }
}

export const errorCodes = {
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_EMAIL: 'INVALID_EMAIL',
  INVALID_PASSWORD: 'INVALID_PASSWORD',
  INVALID_NAME: 'INVALID_NAME',
  DISPOSABLE_EMAIL: 'DISPOSABLE_EMAIL',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_NOT_VERIFIED: 'USER_NOT_VERIFIED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  PLAN_LIMIT_REACHED: 'PLAN_LIMIT_REACHED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  STORAGE_LIMIT_REACHED: 'STORAGE_LIMIT_REACHED',
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  INVALID_CONTENT_TYPE: 'INVALID_CONTENT_TYPE',
  ERROR_SECURITY: 'ERROR_SECURITY',
  AUTH_SECURITY: 'AUTH_SECURITY',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
} as const

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes]

/** Maps error codes to HTTP status codes */
export const httpStatusMap: Record<string, number> = {
  [errorCodes.INVALID_INPUT]: 400,
  [errorCodes.INVALID_EMAIL]: 400,
  [errorCodes.INVALID_PASSWORD]: 400,
  [errorCodes.INVALID_NAME]: 400,
  [errorCodes.DISPOSABLE_EMAIL]: 400,
  [errorCodes.EMAIL_EXISTS]: 409,
  [errorCodes.INVALID_CREDENTIALS]: 401,
  [errorCodes.USER_NOT_FOUND]: 404,
  [errorCodes.USER_NOT_VERIFIED]: 403,
  [errorCodes.INVALID_TOKEN]: 400,
  [errorCodes.TOKEN_EXPIRED]: 410,
  [errorCodes.RATE_LIMIT_EXCEEDED]: 429,
  [errorCodes.ACCOUNT_DELETED]: 403,
  [errorCodes.PLAN_LIMIT_REACHED]: 403,
  [errorCodes.NOT_FOUND]: 404,
  [errorCodes.INTERNAL_ERROR]: 500,
  [errorCodes.STORAGE_LIMIT_REACHED]: 507,
  [errorCodes.STORAGE_UPLOAD_FAILED]: 502,
}
