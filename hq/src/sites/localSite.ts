import { prisma } from 'wasp/server'
import { noExecutionSiteError } from './noExecutionSite'

/**
 * The site that work with no boundary goes to.
 *
 * A run is placed by the storage it works in (capabilityService's
 * resolveExecutionSiteId), and a read that belongs to no single owner asks
 * every site (sites/combinedRead.ts). What is left here is the case
 * with genuinely nothing to be placed by: a question about an agent rather
 * than about a run.
 *
 * That is hq's own site — the single `isDefault` row hq keeps for the site it
 * is paired with by configuration (defaultSite.ts). Other registered sites
 * are never chosen here, however long they have been registered. With no
 * default row, or one that is revoked or has no credential, this returns null
 * and a caller that needs a site calls one of the `require…` functions below
 * instead, which throw the shared "No Execution Site is connected" error.
 */
export async function resolveDefaultSiteRef(): Promise<{ id: string; siteId: string } | null> {
  return prisma.executionSite.findFirst({
    where: { isDefault: true, credentialHash: { not: null }, status: { not: 'REVOKED' } },
    select: { id: true, siteId: true },
  })
}

export async function requireDefaultSiteRef(): Promise<{ id: string; siteId: string }> {
  const ref = await resolveDefaultSiteRef()
  if (!ref) throw noExecutionSiteError()
  return ref
}

/**
 * The default site's logical id, for the few callers that must name a site and
 * have no storage to be placed by. `SiteConfig.siteId` is not an answer: it
 * names no site with a channel behind it.
 */
export async function requireDefaultSiteId(): Promise<string> {
  return (await requireDefaultSiteRef()).siteId
}

/** The default site's `ExecutionSite.id` — what Project and placement rows anchor to. */
export async function requireDefaultExecutionSiteId(): Promise<string> {
  return (await requireDefaultSiteRef()).id
}
