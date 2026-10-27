/**
 * The upload link's live dependencies and its route. The route makes links only: every upload's bytes are hq's
 * relay's to serve (adr-0153), so hq-server registers no route that reads one.
 */
import type { Application, Request } from 'express'
import { prisma } from 'wasp/server'
import { isRelayConnected, issueFileTicket } from '../../relays'
import { browserAddressOf } from '../../relays/relayAddress'
import { hqCors } from '../middleware'
import { reusePictureTickets } from './pictureTickets'
import { uploadAccess } from './uploadAccess'
import { uploadLinkHandler, type UploadLinkDeps } from './uploadLinks'

/**
 * Whose Wasp session the `Authorization: Bearer <sessionId>` header names, or null for none. The route is registered
 * outside Wasp's router, so `req.user` is not filled in for it.
 */
export async function resolveSessionUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  // Imported when first needed: wasp/auth/session chains through modules test files that never sign in don't alias.
  const { getSessionAndUserFromSessionId } = await import('wasp/auth/session')
  const result = await getSessionAndUserFromSessionId(authHeader.substring(7))
  return result?.user?.id ?? null
}

export async function connectedHqRelay(): ReturnType<UploadLinkDeps['hqRelay']> {
  const relay = await prisma.relay.findFirst({ where: { isHq: true } })
  if (!relay || relay.state === 'REMOVED' || relay.credentialHash === null || !isRelayConnected(relay.id)) return null
  const address = browserAddressOf(relay)
  return address && { id: relay.id, address }
}

export const uploadLinkDeps: UploadLinkDeps = {
  resolveUserId: resolveSessionUserId,
  access: uploadAccess,
  hqRelay: connectedHqRelay,
  issue: reusePictureTickets(issueFileTicket),
}

/**
 * Asked for on HQ's own address with the session's token, so it answers a page on another origin (the dev client)
 * as the other APIs do.
 */
export function registerUploadLinkRoute(app: Pick<Application, 'get' | 'options'>, deps: UploadLinkDeps = uploadLinkDeps) {
  app.options('/file-link', hqCors())
  app.get('/file-link', hqCors(), uploadLinkHandler(deps))
}
