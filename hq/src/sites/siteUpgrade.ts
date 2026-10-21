import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  SITE_PROTOCOL_VERSION, SITE_PROTOCOL_VERSION_HEADER, HQ_SITE_REPLACED_HEADER, HQ_SITE_UNKNOWN_HEADER, HQ_SITE_UNKNOWN_VALUE,
  checkProtocolCompatibility, protocolRefusalMessage, type ProtocolVersion,
} from '@agenthix/core'
import { Logger } from '../server/utils/logger'

const logger = new Logger('SiteUpgrade')
const toldReplaced = new Set<string>()
const toldRefused = new Set<string>()

/**
 * The one check a site's upgrade passes, for the control channel and the
 * content transport alike, so the two cannot disagree about who may connect.
 *
 * Authentication runs before version negotiation. A version mismatch is worth
 * recording — it is what lets hq say "this site needs upgrading" instead of
 * "unreachable" — but only for a site that proved who it is, or anyone could
 * mark another site suspended. An unauthenticated caller gets 401 whatever
 * version it claims, and so learns nothing about versions.
 *
 * A failed authentication answers one message whether the credential was wrong
 * or the site revoked, so a caller holding a guessed id learns nothing from
 * which it was. The one deliberate exception is an id hq has no record of at
 * all: it says so (HQ_SITE_UNKNOWN_HEADER), because a real site whose
 * registration is gone — hq's database was reset — has to be told to register
 * again rather than retry forever. That reveals only that an id is unknown,
 * which is not something a guesser can use: it holds no credential for it.
 *
 * The other is the old machine's copy of a site a restore replaced (adr-0119): presenting the very credential the
 * restore replaced, it is told so and when (HQ_SITE_REPLACED_HEADER), so it stops trying and its machine can say
 * why. Only the holder of that credential hears it, so it tells no one anything of another site. Logged once per
 * site while hq runs.
 */
export type SiteUpgradeDeps = {
  authenticate(siteId: string, credential: string): Promise<{ siteId: string } | null>
  /** Whether hq has any record of the id — a revoked site still has one. Asked only after authentication fails. */
  siteExists(siteId: string): Promise<boolean>
  /** When a restore onto another machine replaced this credential of the site; null otherwise. Asked only after authentication fails. */
  replacedAt?(siteId: string, credential: string): Promise<Date | null>
  recordProtocolVersion(siteId: string, version: string): Promise<void>
  /** `attemptedAt` is when this handshake began; a write that lost a race to a newer sign of life is dropped by the store. */
  markVersionMismatch(siteId: string, version: string, attemptedAt: Date): Promise<void>
}

export async function checkSiteUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  deps: SiteUpgradeDeps,
): Promise<{ siteId: string; speak: ProtocolVersion } | null> {
  // Node removes a socket's 'error' listener before emitting 'upgrade', and ws
  // only adds its own inside handleUpgrade. A client that resets during the
  // awaits below would otherwise raise an unlistened 'error' and crash hq —
  // with no credential. Refused sockets are destroyed; accepted ones get ws's
  // handling on top of this.
  socket.on('error', () => {})
  // Taken before any await: it is what a mismatch write is later compared with.
  const attemptedAt = new Date()
  const siteId = headerOf(req, 'x-site-id')
  const credential = bearerOf(req.headers.authorization)
  if (!siteId || !credential) {
    refuseUpgrade(socket, 401, 'Unauthorized')
    return null
  }

  let site: { siteId: string } | null
  try {
    site = await deps.authenticate(siteId, credential)
  } catch (err) {
    logger.error('authentication failed', err)
    refuseUpgrade(socket, 500, 'Internal Server Error')
    return null
  }
  // One message for a wrong credential and a revoked site alike. Only an id hq
  // has no record of is told apart — see the header comment.
  if (!site) {
    let known = true
    let replaced: Date | null = null
    try {
      known = await deps.siteExists(siteId)
      if (known && deps.replacedAt) replaced = await deps.replacedAt(siteId, credential)
    } catch (err) {
      logger.error('existence check failed', err)
      refuseUpgrade(socket, 500, 'Internal Server Error')
      return null
    }
    if (replaced) {
      if (!toldReplaced.has(siteId)) {
        toldReplaced.add(siteId)
        logger.warn(`${siteId}: refused the copy a restore onto another machine replaced on ${replaced.toISOString()}, and told it so`)
      }
      refuseUpgrade(socket, 401, 'Unauthorized', { [HQ_SITE_REPLACED_HEADER]: replaced.toISOString() })
      return null
    }
    refuseUpgrade(socket, 401, 'Unauthorized', known ? {} : { [HQ_SITE_UNKNOWN_HEADER]: HQ_SITE_UNKNOWN_VALUE })
    return null
  }

  const presented = headerOf(req, SITE_PROTOCOL_VERSION_HEADER.toLowerCase())
  const compatibility = checkProtocolCompatibility(SITE_PROTOCOL_VERSION, presented)
  if (!compatibility.ok) {
    // Majors two or more apart, or a version that cannot be read: refused, whichever side is behind. The site keeps
    // its registration and its credential, and is refused until one side upgrades. The 426 states hq's own version,
    // so the site applies the same rule and says which side that is.
    if (!toldRefused.has(`${siteId} ${presented}`)) {
      toldRefused.add(`${siteId} ${presented}`)
      logger.warn(`${siteId}: refused. ${protocolRefusalMessage(compatibility, { own: 'HQ', peer: 'the site' })}`)
    }
    await deps.markVersionMismatch(siteId, presented, attemptedAt).catch(err =>
      logger.error(`could not record the version mismatch for ${siteId}:`, err))
    refuseUpgrade(socket, 426, 'Upgrade Required', { [SITE_PROTOCOL_VERSION_HEADER]: SITE_PROTOCOL_VERSION })
    return null
  }
  // A site one major behind is served through the code kept for its major. At the first major there is none, so it
  // is accepted as it is; that code, and the test that runs it, start here at the first major change.

  void deps.recordProtocolVersion(siteId, presented).catch(err =>
    logger.error(`could not record the protocol version for ${siteId}:`, err))
  return { siteId, speak: compatibility.speak }
}

/**
 * Writes a real HTTP response before destroying the socket. Without it the
 * client sees only a reset and logs nothing that says why.
 */
export function refuseUpgrade(socket: Duplex, code: number, reason: string, headers: Record<string, string> = {}): void {
  const extra = Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('')
  socket.write(`HTTP/1.1 ${code} ${reason}\r\n${extra}Connection: close\r\n\r\n`)
  socket.destroy()
}

function headerOf(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

function bearerOf(authorization: string | undefined): string {
  const match = /^Bearer (.+)$/.exec(authorization ?? '')
  return match ? match[1] : ''
}
