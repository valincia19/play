import { resolveAdminRequestContext } from '../auth'
import type { UserResult } from '../auth'

export async function requireAdminUser(request: Request, status: any): Promise<{ adminUser: UserResult } | { response: unknown }> {
  const context = await resolveAdminRequestContext({ request, status })
  if ('adminUser' in context) {
    return { adminUser: context.adminUser! }
  }

  if ('_authFail' in context) {
    return { response: context._authFail }
  }

  return { response: '_adminContextFail' in context ? context._adminContextFail : undefined }
}
