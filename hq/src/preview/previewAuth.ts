import type { PreviewSession } from 'wasp/entities'
import { assertLocationAccess } from '../storage/locationAccess'

export interface AuthDeps {
  getById: (id: string) => Promise<PreviewSession | null>
  canAccess: (user: { id: string }, s: PreviewSession) => Promise<boolean>
}

export type AuthResult =
  | { ok: true; session: PreviewSession }
  | { ok: false; code: 401 | 403 | 404 | 410; message: string }

/**
 * Per-requester authorization (ADR-0036): naming a live preview is necessary but not sufficient —
 * the request must name a person who may access the preview's storage boundary. The preview host
 * names them from its signed cookie (previewHost.ts), the access check's action from hq's own
 * sign-in (openPreviewAction.ts).
 */
export async function authorizePreview(
  previewId: string,
  user: { id: string } | null,
  deps: AuthDeps,
): Promise<AuthResult> {
  if (!user) return { ok: false, code: 401, message: 'login required' }
  const s = await deps.getById(previewId)
  if (!s) return { ok: false, code: 404, message: 'no such preview' }
  // `stopping` is a preview past its expiry whose site has not yet confirmed
  // the stop (previewSweep.ts). It is over as far as anyone watching is
  // concerned, and answers exactly as `expired` does.
  if (s.status === 'expired' || s.status === 'stopping') {
    return { ok: false, code: 410, message: 'this preview has ended' }
  }
  if (!(await deps.canAccess(user, s))) return { ok: false, code: 403, message: 'not authorized for this preview' }
  return { ok: true, session: s }
}

/**
 * Who may watch a preview: whoever may reach the storage boundary whose files
 * it is serving. Not "any authenticated user", which is what stood here while
 * the row did not yet say which boundary was behind it.
 *
 * This is the one location access rule, applied to the boundary on the row —
 * the same check every other route serving a boundary's content makes, and
 * deliberately not a second rule of preview's own. A preview is a window onto
 * files; the answer to "may this person see these files" already exists.
 *
 * A row with no boundary recorded is REFUSED, not admitted. There is nothing
 * to check it against, and "we cannot tell" must never resolve to "yes" on a
 * path that serves somebody's working tree to a browser.
 *
 * Every throw is a refusal, including the ones that are not about this person:
 * the rule answers 404 for a project that is gone and 503 when the site
 * holding a named workspace cannot be reached, and neither is an answer this
 * caller may be given the benefit of. `authorizePreview` turns all of them
 * into one 403, which also keeps the response from telling an outsider which
 * of the two it was.
 */
export async function canAccess(user: { id: string }, s: PreviewSession): Promise<boolean> {
  if (!s.ownerType || !s.ownerId) return false
  try {
    await assertLocationAccess(
      { ownerType: s.ownerType, ownerId: s.ownerId, workspaceId: s.workspaceId },
      user.id,
      'read',
    )
    return true
  } catch {
    return false
  }
}
