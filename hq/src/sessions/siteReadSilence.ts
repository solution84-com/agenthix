/**
 * A listing whose rows each carry a detail read from the row's own site — the
 * chat list's last-message preview, the Activity panel's latest run — keeps
 * the row when that site cannot be asked, and says so instead of showing the
 * detail as absent. "No messages" and "could not ask" are different facts
 * (see `shared/siteSilence.ts`).
 *
 * The silence is classified by the same rules a combined read uses
 * (`sites/siteSilence.ts`), so a person is told the same thing about a
 * site whichever screen they are on. A revoked site is not named, for the same
 * reason a combined read does not name one.
 */
import { prisma } from 'wasp/server'
import type { SiteSilence } from '@agenthix/core'
import { classifyFailure } from '../sites/siteSilence'
import { DEFAULT_REQUEST_TIMEOUT_MS } from '../sites/channel/pendingRequests'
import { displaySiteName } from '../shared/siteName'

const REVOKED = 'REVOKED'

/**
 * One classifier per listing: its rows share a handful of sites, so each
 * site's row is read once however many of its sessions failed.
 */
export function siteReadSilences(): (siteId: string, err: unknown) => Promise<SiteSilence | null> {
  const sites = new Map<string, ReturnType<typeof readSite>>()
  return async (siteId, err) => {
    if (!sites.has(siteId)) sites.set(siteId, readSite(siteId))
    const site = await sites.get(siteId)!
    if (!site || site.status === REVOKED) return null
    const outcome = classifyFailure(site, err, DEFAULT_REQUEST_TIMEOUT_MS)
    return outcome.kind === 'silence' ? outcome.silence : null
  }
}

async function readSite(siteId: string) {
  const site = await prisma.executionSite.findUnique({
    where: { siteId },
    select: { id: true, siteId: true, label: true, isDefault: true, status: true, protocolVersion: true },
  })
  if (!site) return null
  const { isDefault, ...rest } = site
  return { ...rest, label: displaySiteName({ label: site.label, isDefault }) }
}
