import type { GetHqReadOnly } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { readOnlyNow } from './readOnly'

/** Whether hq is read-only for a move, and since when, for the notice every screen shows (host-management spec §13). */
export const getHqReadOnly: GetHqReadOnly<void, { readOnly: false } | { readOnly: true; to: string | null; since: string }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const r = readOnlyNow()
  return r ? { readOnly: true, to: r.to, since: r.since } : { readOnly: false }
}
