/**
 * A site's move to a new machine, as hq takes part in it (host-management spec §13 *A site moves*): the Fleet Console
 * opens the transfer between the two machines (relay/transfers.ts), and, once the site answers from the new
 * machine, has hq record which machine carries it. The site keeps its id and its credential: nothing about it is made
 * again, so its connection is the same site's. It takes the new machine's name, from hq's own record of that machine,
 * as every site is named after its machine (spec §6); the projects placed on it show the new name.
 */
import { prisma } from 'wasp/server'
import type { RelayHub } from './relay/relayHub'
import { ConsoleRefusal } from './consoleMethods'

async function fleetMachine(hostId: string): Promise<{ id: string; consoleFingerprint: string; machineName: string }> {
  const host = await prisma.relayHost.findUnique({ where: { id: hostId }, select: { id: true, consoleFingerprint: true, disconnectedAt: true, machineName: true } })
  if (!host || host.disconnectedAt) throw new ConsoleRefusal('not_found', 'That machine is not in the fleet.')
  return host
}

export async function openTransfer(hub: RelayHub, p: { transferId: string; fromHostId: string; toHostId: string; expiresAt: string }): Promise<{ opened: boolean }> {
  if (p.fromHostId === p.toHostId) throw new ConsoleRefusal('not_allowed', 'A site moves to another machine, not the one it is on.')
  const [from, to] = [await fleetMachine(p.fromHostId), await fleetMachine(p.toHostId)]
  // Both answer the same Fleet Console: a transfer never joins two fleets.
  if (from.consoleFingerprint !== to.consoleFingerprint) throw new ConsoleRefusal('not_allowed', 'The two machines are not managed by the same Fleet Console.')
  return { opened: hub.transfers.open({ transferId: p.transferId, fromHostId: from.id, toHostId: to.id, expiresAt: new Date(p.expiresAt) }) }
}

export async function moveSite(p: { executionSiteId: string; toHostId: string }): Promise<{ moved: boolean }> {
  const to = await fleetMachine(p.toHostId)
  return prisma.$transaction(async tx => {
    // The same lock as registering a site: a machine carries at most one (ADR-0108).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('site-register', 0))`
    const site = await tx.executionSite.findUnique({ where: { id: p.executionSiteId }, select: { id: true, isDefault: true, status: true, relayHostId: true } })
    if (!site || site.status === 'REVOKED') throw new ConsoleRefusal('not_found', 'No such site.')
    if (site.isDefault) throw new ConsoleRefusal('not_allowed', "HQ's own site moves only with HQ.")
    if (site.relayHostId === to.id) return { moved: false }
    const carried = await tx.executionSite.findFirst({ where: { relayHostId: to.id, status: { not: 'REVOKED' } }, select: { label: true } })
    if (carried) throw new ConsoleRefusal('not_allowed', `That machine already carries the site "${carried.label}".`)
    await tx.executionSite.update({ where: { id: site.id }, data: { relayHostId: to.id, label: to.machineName } })
    return { moved: true }
  })
}
