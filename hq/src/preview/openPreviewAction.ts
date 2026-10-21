/**
 * hq's access check for a preview (adr-0071): the signed-in person asks to
 * open one, hq checks they may, and hands back a one-time ticket addressed to
 * the preview's own host.
 *
 * It runs on hq's origin, as an ordinary authenticated action, because that is
 * the one place hq knows who the person is — the preview host cannot, and must
 * not be able to, read hq's sign-in. A person already signed in passes straight
 * through: the page calls this and navigates on.
 */
import { HttpError } from 'wasp/server'
import type { OpenPreview } from 'wasp/server/operations'
import { authorizePreview, canAccess, type AuthDeps } from './previewAuth'
import { getById } from './previewRegistry'
import { previewTickets, type TicketStore } from './previewTicket'
import { PREVIEW_ENTER_PATH, hqBaseUrl, previewDomain, previewOrigin } from './previewWiring'

export interface OpenPreviewDeps extends AuthDeps {
  domain: () => string | null
  hqUrl: () => string
  tickets: TicketStore
}

export async function openPreviewFor(
  user: { id: string },
  previewId: string,
  deps: OpenPreviewDeps,
): Promise<{ url: string }> {
  const domain = deps.domain()
  if (!domain) {
    throw new HttpError(404, 'Previews are off on this install: its operator has not set a preview domain.')
  }
  if (!/^[a-z0-9]+$/.test(previewId)) throw new HttpError(404, 'no such preview')
  const auth = await authorizePreview(previewId, user, deps)
  if (!auth.ok) throw new HttpError(auth.code, auth.message)
  const ticket = deps.tickets.mint(user.id, previewId)
  return { url: `${previewOrigin(previewId, domain, deps.hqUrl())}${PREVIEW_ENTER_PATH}?ticket=${ticket}` }
}

export const openPreview: OpenPreview<{ previewId: string }, { url: string }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  return openPreviewFor(context.user, String(args?.previewId ?? ''), {
    domain: () => previewDomain(),
    hqUrl: hqBaseUrl,
    tickets: previewTickets,
    getById,
    canAccess,
  })
}
