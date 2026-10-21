/**
 * The org's web-search key (spec "Tool-name mapping"): Exa's, stored as the
 * org's model keys are — a Provider row, encrypted — and sent to the site with
 * each OpenCode turn for its `web_search` tool. An admin sets and removes it;
 * it is never read back.
 */
import { HttpError } from 'wasp/server'
import type { SetWebSearchKey, DeleteWebSearchKey } from 'wasp/server/operations'
import { requireSecretsKey } from '../server/crypto/requireSecretsKey'
import { requireRole } from '../server/identity/requireRole'
import { deleteWebSearchKey as removeKey, setWebSearchKey as storeKey } from '../server/providerService'

export const setWebSearchKey: SetWebSearchKey<{ secret: string }, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const secret = (args.secret ?? '').trim()
  if (!secret) throw new HttpError(400, 'A key is required')
  await requireRole(context, 'ADMIN', 'Setting the organisation\'s web-search key')
  requireSecretsKey('Setting the organisation\'s web-search key')
  await storeKey(secret)
  return { ok: true }
}

export const deleteWebSearchKey: DeleteWebSearchKey<void, { ok: boolean }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireRole(context, 'ADMIN', 'Removing the organisation\'s web-search key')
  await removeKey()
  return { ok: true }
}
