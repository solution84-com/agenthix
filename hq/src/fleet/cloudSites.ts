/**
 * The sites Agenthix Cloud runs for this hq (pre-release spec B6; adr-0115). The host service on hq's machine, enrolled
 * with Cloud, passes Cloud's `site.register` and `site.unregister` over hq's control socket
 * (auth/machine/cloudMachineCommands.ts); nothing else reaches these.
 *
 * As for a site a fleet admin adds (siteCredentials.ts), hq is given the credential's hash only, and the row's id is a
 * placeholder the site's first connection replaces (registrationService.ts). A Cloud site is known by Cloud's id of
 * the machine that runs it, which is also what makes it Cloud's (siteFigures.ts). Cloud names it; two sites of one name
 * are refused, as everywhere.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { revokeSite } from '../sites/revokeSite'

export class CloudSiteRefusal extends Error {
  constructor(readonly code: 'conflict' | 'not_found', message: string) {
    super(message)
    this.name = 'CloudSiteRefusal'
  }
}

export type CloudSiteRegistration = { machineId: string; siteName: string; credentialHash: string }

/** Asked again for the same machine, the same site, and nothing changes. */
export async function registerCloudSite(input: CloudSiteRegistration): Promise<{ executionSiteId: string }> {
  const credentialHash = input.credentialHash.toLowerCase()
  return prisma.$transaction(async tx => {
    // The same lock as the Fleet Console's registration, so the two cannot both take one name.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('site-register', 0))`
    const existing = await tx.executionSite.findFirst({
      where: { cloudMachineId: input.machineId, status: { not: 'REVOKED' } }, select: { id: true },
    })
    if (existing) return { executionSiteId: existing.id }
    const named = await tx.executionSite.findFirst({
      where: { label: { equals: input.siteName, mode: 'insensitive' }, status: { not: 'REVOKED' } }, select: { label: true },
    })
    if (named) throw new CloudSiteRefusal('conflict', `A site named ${named.label} is already in HQ.`)
    if (await tx.executionSite.count({ where: { credentialHash } })) throw new CloudSiteRefusal('conflict', 'That credential is already in use.')
    const site = await tx.executionSite.create({
      data: { siteId: randomUUID(), label: input.siteName, status: 'REGISTERED', credentialHash, cloudMachineId: input.machineId },
      select: { id: true },
    })
    return { executionSiteId: site.id }
  })
}

/** Retires one of Cloud's sites and forgets its credential; `removed` is false when it already was. */
export async function unregisterCloudSite(executionSiteId: string): Promise<{ removed: boolean }> {
  const site = await prisma.executionSite.findFirst({
    where: { id: executionSiteId, cloudMachineId: { not: null } }, select: { id: true, siteId: true, status: true },
  })
  if (!site) throw new CloudSiteRefusal('not_found', 'No site Agenthix Cloud added has that id.')
  const removed = site.status !== 'REVOKED'
  if (removed) await revokeSite(site.siteId, { byCloud: true })
  await prisma.executionSite.update({ where: { id: site.id }, data: { credentialHash: null } })
  return { removed }
}
