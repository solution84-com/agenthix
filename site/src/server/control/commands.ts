import { prisma } from '#db'
import { hqConnectionManager } from '../hq/hqConnection'
import { currentPairingProblem, type HqLinkProblem } from '../hq/linkProblem'
import { pairedBySecret } from '../registration/pairing'

/**
 * What the site's command does on the machine (ADR-0065). Reached only through the control socket, so running it is the
 * installer's proof. A site takes part in an HQ only when its host service starts it for the Fleet Console, or as hq's
 * own site by pairing (host-management spec §10): it has no command that asks to join.
 */

export type SiteStatusReport = {
  siteId: string
  /** hq's own site, connected by HQ_PAIRING_SECRET (adr-0070): it cannot leave hq. */
  pairedBySecret: boolean
  /** Why it is not connected, from a closed set; null while it is, or when nothing says why. */
  problem: HqLinkProblem | null
  hq: null | {
    url: string
    status: string
    connected: boolean
    connectedAt: string | null
    lastError: string | null
    requiredProtocolVersion: string | null
  }
  /**
   * hq said it moves to `to` and the address has not passed the move check yet (host-management spec §13): the site
   * keeps `hq.url` until it does. `problem` is the last check's outcome, null before the first.
   */
  moving: null | { to: string; since: string; problem: string | null }
  /** hq refuses this copy: a restore of the site onto another machine replaced it at `at` (adr-0119). */
  replaced: null | { at: string }
}

async function siteIdentity() {
  const config = await prisma.siteConfig.findFirst()
  if (!config) throw new Error('SiteConfig is missing — cannot determine this site’s identity')
  return config
}

/** A problem pairing at this start outranks the link: the link may be one an earlier start stored. */
function linkProblem(link: { status: string } | null, connected: boolean): HqLinkProblem | null {
  if (connected) return null
  const pairing = currentPairingProblem()
  if (pairing) return pairing
  if (!link) return null
  if (link.status === 'REVOKED') return 'credentialRefused'
  return hqConnectionManager.problem
}

export async function readStatus(): Promise<SiteStatusReport> {
  const config = await siteIdentity()
  const link = await prisma.hqConnection.findFirst()
  const connected = Boolean(link) && hqConnectionManager.connectionState() === 'connected'
  return {
    siteId: config.siteId,
    pairedBySecret: pairedBySecret(),
    problem: linkProblem(link, connected),
    hq: link
      ? {
          url: link.hqUrl,
          status: link.status,
          connected,
          connectedAt: link.connectedAt ? new Date(link.connectedAt).toISOString() : null,
          lastError: hqConnectionManager.lastError,
          requiredProtocolVersion: hqConnectionManager.requiredProtocolVersion,
        }
      : null,
    moving: link?.movingTo
      ? { to: link.movingTo, since: (link.movingSince ?? link.updatedAt).toISOString(), problem: link.moveProblem ?? null }
      : null,
    replaced: link?.status === 'REVOKED' && link.replacedAt ? { at: new Date(link.replacedAt).toISOString() } : null,
  }
}
