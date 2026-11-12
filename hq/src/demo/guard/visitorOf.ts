/**
 * Who sent a request to the demo, from its session, before Wasp's own auth runs: the storage budget is per visitor, and
 * each request marks its visitor active (`../activeVisitors.ts`). A session is looked up again at most every
 * `RECHECK_MS`, so a screen's polling costs no read each time, and a header that is not a session costs one read per
 * `RECHECK_MS` too.
 */
import type { Request } from 'express'
import { Logger } from '../../server/utils/logger'
import { markSeen } from '../activeVisitors'

const logger = new Logger('DemoGuard')

export const RECHECK_MS = 5 * 60 * 1000
const MAX_REMEMBERED = 5_000

/** By the whole header: the visitor it names, or null for one that is not a valid session (a miss is remembered too). */
const remembered = new Map<string, { userId: string | null; at: number }>()

/** For tests only. */
export function forgetVisitorsForTests(): void {
  remembered.clear()
}

/** The user the request's session belongs to; null without a session that is still valid. */
export async function visitorOf(req: Request, now = Date.now()): Promise<string | null> {
  const header = req.headers?.authorization
  if (typeof header !== 'string' || header === '') return null
  const known = remembered.get(header)
  if (known && now - known.at < RECHECK_MS) return known.userId
  // Imported when first needed: wasp/auth/session reaches the server's set-up, which the guard's tests do not load.
  const { getSessionAndUserFromBearerToken } = await import('wasp/auth/session')
  const found = await getSessionAndUserFromBearerToken(req)
  if (remembered.size >= MAX_REMEMBERED) remembered.clear()
  remembered.set(header, { userId: found?.user.id ?? null, at: now })
  if (!found) return null
  await markSeen(found.user.id).catch((err: unknown) => logger.warn('could not mark a visitor active', err))
  return found.user.id
}
