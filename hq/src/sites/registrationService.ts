import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { hashCredential, credentialMatches } from './credentials'
import { adoptSiteId, authenticateDefaultSite } from './defaultSite'

/**
 * Verifies a site's machine credential, or the default site's pairing secret. Callers: the site-authenticated HTTP
 * endpoints (dataApi.ts's /api/v1/data, identityApi.ts's capability renewal) and
 * the control channel's handshake (sites/channel/index.ts).
 */
export async function authenticateSite(siteId: string, credential: string) {
  const site = await prisma.executionSite.findUnique({ where: { siteId } })
  if (site && site.status !== 'REVOKED' && credentialMatches(credential, site.credentialHash)) return site
  const added = await authenticateFleetConsoleSite(siteId, credential)
  if (added) return added
  // Additive: the default site connects with the pairing secret from whatever
  // id its database gave it, so a registered-site miss is not yet a refusal.
  return authenticateDefaultSite(siteId, credential)
}

/**
 * A site the Fleet Console or Agenthix Cloud registered is known by its credential, not its id: its row starts with a
 * placeholder id, and the site's first connection — or its first after its database was wiped — gives it the site's own.
 */
async function authenticateFleetConsoleSite(siteId: string, credential: string) {
  const row = await prisma.executionSite.findFirst({
    where: {
      credentialHash: hashCredential(credential), isDefault: false,
      OR: [{ relayHostId: { not: null } }, { cloudMachineId: { not: null } }],
    },
  })
  if (!row || row.status === 'REVOKED' || !credentialMatches(credential, row.credentialHash)) return null
  if (row.siteId === siteId) return row
  const sameMachine = row.relayHostId ? { relayHostId: row.relayHostId } : { cloudMachineId: row.cloudMachineId! }
  await releaseRemovedSiteId(siteId, sameMachine)
  return adoptSiteId(row, siteId, row.relayHostId ? 'a site added in the Fleet Console' : 'a site Agenthix Cloud added')
}

/**
 * A site removed and added again on its machine, its data kept, presents the id it always had, still held by its
 * removed row. That row gives the id up — but only to a site on the same machine, so no other machine's site can take
 * an id that is not its own.
 */
async function releaseRemovedSiteId(siteId: string, sameMachine: { relayHostId: string } | { cloudMachineId: string }): Promise<void> {
  await prisma.executionSite.updateMany({
    where: { siteId, status: 'REVOKED', isDefault: false, ...sameMachine },
    data: { siteId: `removed-${randomUUID()}` },
  })
}

/** Whether hq has any record of this site id, revoked or not. Lets the upgrade check tell an unknown id from a wrong credential. */
export async function siteExists(siteId: string): Promise<boolean> {
  return (await prisma.executionSite.count({ where: { siteId } })) > 0
}
