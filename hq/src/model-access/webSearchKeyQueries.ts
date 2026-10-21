/** Whether the org has a web-search key — presence only, and for an admin only. */
import { HttpError } from 'wasp/server'
import type { GetWebSearchKeyStatus } from 'wasp/server/operations'
import { requireRole } from '../server/identity/requireRole'
import { hasWebSearchKey } from '../server/providerService'

export const getWebSearchKeyStatus: GetWebSearchKeyStatus<void, { present: boolean }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireRole(context, 'ADMIN', 'Viewing the organisation\'s web-search key')
  return { present: await hasWebSearchKey() }
}
