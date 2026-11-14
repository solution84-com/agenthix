/**
 * The org's web-search key (spec "Tool-name mapping"): Exa's, stored as the
 * org's model keys are — a Provider row, encrypted — and sent to the site with
 * each OpenCode turn for its `web_search` tool. An admin sets and removes it;
 * it is never read back.
 *
 * It is checked with Exa before it is stored (`webSearchKeyCheck.ts`). A key Exa
 * refuses is a final answer (422) and is not stored. When Exa could not be asked,
 * the save is refused with `code: 'not_checked'` (502), and the admin may save it
 * anyway with `unchecked: true`.
 */
import { HttpError } from 'wasp/server'
import type { SetWebSearchKey, DeleteWebSearchKey } from 'wasp/server/operations'
import { requireSecretsKey } from '../server/crypto/requireSecretsKey'
import { requireRole } from '../server/identity/requireRole'
import { deleteWebSearchKey as removeKey, setWebSearchKey as storeKey } from '../server/providerService'
import { webSearchKeyCheck } from './webSearchKeyCheck'

export const KEY_REFUSED = 'Exa refused this key. Check that you copied all of it and that the account has credit, then try again.'
export const KEY_NOT_CHECKED = 'Exa did not answer, so the key could not be checked.'

export const setWebSearchKey: SetWebSearchKey<{ secret: string; unchecked?: boolean }, { ok: boolean }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const secret = (args.secret ?? '').trim()
  if (!secret) throw new HttpError(400, 'A key is required')
  await requireRole(context, 'ADMIN', 'Setting the organisation\'s web-search key')
  requireSecretsKey('Setting the organisation\'s web-search key')
  if (args.unchecked !== true) {
    const verdict = await webSearchKeyCheck().check(secret)
    if (!verdict.ok && verdict.outcome === 'refused') {
      throw new HttpError(422, verdict.detail ? `${KEY_REFUSED} Exa says: ${verdict.detail}` : KEY_REFUSED, { code: 'refused_by_vendor' })
    }
    if (!verdict.ok) throw new HttpError(502, KEY_NOT_CHECKED, { code: 'not_checked' })
  }
  await storeKey(secret)
  return { ok: true }
}

export const deleteWebSearchKey: DeleteWebSearchKey<void, { ok: boolean }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  await requireRole(context, 'ADMIN', 'Removing the organisation\'s web-search key')
  await removeKey()
  return { ok: true }
}
