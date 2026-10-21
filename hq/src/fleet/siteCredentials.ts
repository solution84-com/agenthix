/**
 * A site's credential, accepted and removed only by the Fleet Console over its connection (host-management spec §6
 * step 5, §9; adr-0115). The host service made the credential and keeps it; hq is given its hash, so the credential
 * never crosses the network. The site's own id is not known yet: the row holds a placeholder that the site's first
 * connection with the credential replaces (registrationService.ts), as the default site's does.
 *
 * Nothing else creates or removes a non-default site's credential: the organisation admin's approval and removal are
 * refused (sites/actions.ts). Agenthix Cloud adds and removes the sites it runs through hq's machine (cloudSites.ts).
 *
 * A site is named after the machine that carries it (host-management spec §6), from hq's own record of that machine:
 * no name is taken from the Fleet Console. Two sites of one name are refused, so people can tell them apart; the name
 * is a label only, and nothing is found or trusted by it.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import { revokeSite } from '../sites/revokeSite'
import { ConsoleRefusal } from './consoleMethods'

export async function registerSite(input: { hostId: string; credentialHash: string }): Promise<{ executionSiteId: string }> {
  const credentialHash = input.credentialHash.toLowerCase()

  const host = await prisma.relayHost.findUnique({ where: { id: input.hostId }, select: { id: true, disconnectedAt: true, machineName: true } })
  if (!host || host.disconnectedAt) throw new ConsoleRefusal('not_found', 'That machine is not in the fleet.')
  const label = host.machineName

  const site = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('site-register', 0))`
    // ADR-0108: a machine carries at most one site.
    const carried = await tx.executionSite.findFirst({ where: { relayHostId: host.id, status: { not: 'REVOKED' } }, select: { label: true } })
    if (carried) throw new ConsoleRefusal('not_allowed', `That machine already carries the site "${carried.label}".`)
    const named = await tx.executionSite.findFirst({
      where: { label: { equals: label, mode: 'insensitive' }, status: { not: 'REVOKED' } }, select: { label: true },
    })
    if (named) throw new ConsoleRefusal('not_allowed', `A site named ${named.label} is already in HQ, and two sites of one name cannot both take part. Give the machine another name.`)
    // Any row with this hash, the default site's included: a credential is one site's.
    if (await tx.executionSite.count({ where: { credentialHash } })) throw new ConsoleRefusal('not_allowed', 'That credential is already in use.')
    return tx.executionSite.create({
      data: { siteId: randomUUID(), label, status: 'REGISTERED', credentialHash, relayHostId: host.id },
    })
  })
  return { executionSiteId: site.id }
}

export async function removeSite(input: { executionSiteId: string }): Promise<{ removed: boolean }> {
  const site = await prisma.executionSite.findUnique({
    where: { id: input.executionSiteId },
    select: { siteId: true, isDefault: true, status: true },
  })
  if (!site) throw new ConsoleRefusal('not_found', 'No such site.')
  if (site.isDefault) throw new ConsoleRefusal('not_allowed', "HQ's own site goes only with HQ.")
  if (site.status === 'REVOKED') return { removed: false }
  await revokeSite(site.siteId, { byFleetConsole: true })
  return { removed: true }
}
