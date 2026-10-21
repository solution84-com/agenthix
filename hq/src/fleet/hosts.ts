/**
 * The machines in the fleet, as hq's relay knows them (host-management spec §6): each host service a fleet admin
 * accepted, its public identity, the Fleet Console it pinned, and its machine credential as a hash. Disconnecting
 * removes the credential, so the link is refused from then on. A machine that left by itself keeps it, for nothing
 * but saying so again: its link is refused too, and it stays listed until a fleet admin removes it.
 */
import { prisma } from 'wasp/server'
import { credentialMatches, hashCredential } from '../sites/credentials'
import type { RelayPeer } from './relay/relayHub'

const peerOf = (row: { id: string; fingerprint: string; consoleFingerprint: string }): RelayPeer =>
  ({ hostId: row.id, fingerprint: row.fingerprint, consoleFingerprint: row.consoleFingerprint })

/** A leave counts only since the machine last joined: a rejoin starts afresh. */
const ownLeave = (row: { joinedAt: Date; leftAt: Date | null }): Date | null =>
  row.leftAt && row.leftAt >= row.joinedAt ? row.leftAt : null

export async function authenticateHost(credential: string): Promise<RelayPeer | null> {
  const row = await prisma.relayHost.findUnique({ where: { credentialHash: hashCredential(credential) } })
  if (!row || row.disconnectedAt || ownLeave(row) || !credentialMatches(credential, row.credentialHash)) return null
  return peerOf(row)
}

export async function knownHost(fingerprint: string): Promise<RelayPeer | null> {
  const row = await prisma.relayHost.findUnique({ where: { fingerprint } })
  return row && row.credentialHash && !row.disconnectedAt && !ownLeave(row) ? peerOf(row) : null
}

/** A stop word older than this, while the machine answers on its link, is over even if the Fleet Console has not said. */
const STOP_OUTLIVED_MS = 60_000

export async function touchHost(hostId: string, now = new Date()): Promise<void> {
  await prisma.relayHost.updateMany({ where: { id: hostId, disconnectedAt: null }, data: { lastSeenAt: now } })
  // It answers again: a stop it said earlier no longer holds back the next notice, should the Fleet Console be away.
  await prisma.relayHost.updateMany({
    where: { id: hostId, stoppedAt: { lt: new Date(now.getTime() - STOP_OUTLIVED_MS) } },
    data: { stoppedAt: null },
  })
}

/**
 * `site` is the site the machine carries, or carried last: hq's id for it, for a link to its page. `leftAt` is set
 * when the machine disconnected itself since it joined (spec §6) — it said so with its machine credential, or its site
 * left by itself — and it stays in the fleet until a fleet admin removes it.
 */
export type FleetHost = {
  hostId: string
  fingerprint: string
  machineName: string
  joinedAt: Date
  lastSeenAt: Date | null
  site: { id: string } | null
  leftAt: Date | null
  /** It carries hq's own site: always told about when it stops answering. */
  hqMachine: boolean
  /** As the Fleet Console said (`host.silenceFacts`); hq's machine is always yes. */
  notifyIfSilent: boolean
  /** Its host service said it stops on purpose, by the Fleet Console's word; null once it answers again. */
  stoppedAt: Date | null
}

type SiteRow = { id: string; status: string; leftByItself: boolean; revokedAt: Date | null }

/** The earlier of the machine's own leave and its last site's, each counted only since the machine joined. */
export function leftAtOf(joinedAt: Date, latest: SiteRow | undefined, hostLeftAt: Date | null = null): Date | null {
  const own = ownLeave({ joinedAt, leftAt: hostLeftAt })
  const bySite = latest && latest.status === 'REVOKED' && latest.leftByItself && latest.revokedAt && latest.revokedAt >= joinedAt
    ? latest.revokedAt : null
  if (!own || !bySite) return own ?? bySite
  return own < bySite ? own : bySite
}

export async function connectedHosts(): Promise<FleetHost[]> {
  const rows = await prisma.relayHost.findMany({
    where: { disconnectedAt: null, credentialHash: { not: null } },
    orderBy: { joinedAt: 'asc' },
    include: {
      sites: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, leftByItself: true, revokedAt: true } },
      _count: { select: { sites: { where: { isDefault: true } } } },
    },
  })
  return rows.map(r => ({
    hostId: r.id, fingerprint: r.fingerprint, machineName: r.machineName, joinedAt: r.joinedAt, lastSeenAt: r.lastSeenAt,
    site: r.sites[0] ? { id: r.sites[0].id } : null,
    leftAt: leftAtOf(r.joinedAt, r.sites[0], r.leftAt),
    hqMachine: r._count.sites > 0,
    notifyIfSilent: r._count.sites > 0 || r.notifyIfSilent !== false,
    stoppedAt: r.stoppedAt,
  }))
}

/**
 * The two facts only the Fleet Console knows of a machine, for hq's *not heard from* notice: whether its fleet admins
 * asked to be told, and when it said it stops on purpose. A notification preference only. False for a machine hq does
 * not list.
 */
export async function keepSilenceFacts(facts: { hostId: string; notifyIfSilent: boolean; stoppedAt: string | null }): Promise<boolean> {
  const { count } = await prisma.relayHost.updateMany({
    where: { id: facts.hostId, disconnectedAt: null },
    data: { notifyIfSilent: facts.notifyIfSilent, stoppedAt: facts.stoppedAt ? new Date(facts.stoppedAt) : null },
  })
  return count > 0
}

/**
 * A machine leaving by itself, known by its machine credential alone (spec §6). The only effect: it is marked as
 * having left. `unknown` when hq does not know the credential (a fleet admin removed the machine first); `hqMachine`
 * for the machine that carries hq's own site, which never leaves this way.
 */
export async function hostLeftByItself(credential: string, now = new Date()): Promise<{ hostId: string } | 'unknown' | 'hqMachine'> {
  const row = await prisma.relayHost.findUnique({
    where: { credentialHash: hashCredential(credential) },
    include: { sites: { where: { isDefault: true }, select: { id: true }, take: 1 } },
  })
  if (!row || row.disconnectedAt || !credentialMatches(credential, row.credentialHash)) return 'unknown'
  if (row.sites.length) return 'hqMachine'
  // Said again, it keeps the first time; a rejoin since the read is not undone.
  if (!ownLeave(row)) {
    await prisma.relayHost.updateMany({ where: { id: row.id, joinedAt: row.joinedAt, disconnectedAt: null }, data: { leftAt: now } })
  }
  return { hostId: row.id }
}

/** True when it held a credential until now. */
export async function disconnectHost(hostId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.relayHost.updateMany({
    where: { id: hostId, disconnectedAt: null },
    data: { credentialHash: null, disconnectedAt: now },
  })
  return count === 1
}
