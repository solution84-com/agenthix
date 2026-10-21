/**
 * Connecting a machine (host-management spec §6, core's join.ts), hq's part. The Fleet Console opens a join with the
 * lookup derived from its one-time code — never the code — and hq keeps only the lookup's hash. A machine that presents
 * the lookup spends it: it works once, and not after its hour. hq passes the machine's half to the Fleet Console, and on
 * the fleet admin's confirmation makes the machine's credential, keeps its hash, and hands the credential over on the
 * joining connection only.
 */
import { createHash } from 'node:crypto'
import { prisma } from 'wasp/server'
import { MACHINE_RELAY_CREDENTIAL_PREFIX, type HostIdentity, type JoinAcceptance, type JoinPurpose } from '@agenthix/core'
import { fingerprintOf } from '@agenthix/core/host-crypto'
import { generateCredential, hashCredential } from '../sites/credentials'
import type { JoinClaim } from './relay/hostLinkServer'
import type { RelayHub } from './relay/relayHub'
import { MAX_JOIN_TTL_MS, ConsoleRefusal } from './consoleMethods'
import { disconnectHost } from './hosts'

const lookupHash = (lookup: string) => createHash('sha256').update(lookup.toLowerCase(), 'utf8').digest('hex')

export async function openJoin(input: { lookup: string; expiresAt: string; purpose: JoinPurpose }, now = new Date()): Promise<{ joinId: string }> {
  const latest = now.getTime() + MAX_JOIN_TTL_MS
  const asked = Date.parse(input.expiresAt)
  if (!(asked > now.getTime())) throw new ConsoleRefusal('not_allowed', 'That code has already expired.')
  try {
    const row = await prisma.relayJoin.create({
      data: { lookupHash: lookupHash(input.lookup), purpose: input.purpose, expiresAt: new Date(Math.min(asked, latest)) },
    })
    return { joinId: row.id }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw new ConsoleRefusal('not_allowed', 'That code was used before; make a new one.')
    throw err
  }
}

export async function claimJoin(lookup: string, now = new Date()): Promise<JoinClaim | null> {
  const hash = lookupHash(lookup)
  const claimed = await prisma.relayJoin.updateMany({
    where: { lookupHash: hash, state: 'OPEN', expiresAt: { gt: now } },
    data: { state: 'CLAIMED' },
  })
  const row = await prisma.relayJoin.findUnique({ where: { lookupHash: hash } })
  if (!row) return null
  if (claimed.count === 1) return { ok: true, joinId: row.id, expiresAt: row.expiresAt }
  if (row.state === 'OPEN') return { ok: false, reason: 'expired' }
  return { ok: false, reason: row.state === 'REFUSED' || row.state === 'CLOSED' ? 'refused' : 'used' }
}

export async function recordJoinRequest(
  joinId: string,
  request: { fingerprint: string; identity: HostIdentity; machineName: string; binding: string },
  now = new Date(),
): Promise<boolean> {
  const { count } = await prisma.relayJoin.updateMany({
    where: { id: joinId, state: 'CLAIMED', hostFingerprint: null, expiresAt: { gt: now } },
    data: {
      hostFingerprint: request.fingerprint,
      hostIdentity: request.identity,
      machineName: request.machineName,
      binding: request.binding,
    },
  })
  return count === 1
}

const GONE = 'The machine is no longer waiting; run the connect command on it again with a new code.'

export async function acceptJoin(hub: RelayHub, joinId: string, acceptance: JoinAcceptance, now = new Date()): Promise<{ hostId: string }> {
  if (!hub.isJoining(joinId)) throw new ConsoleRefusal('failed', GONE)
  const consoleFingerprint = await fingerprintOf(acceptance.identity)
  const { value: machineCredential } = generateCredential(MACHINE_RELAY_CREDENTIAL_PREFIX)
  const host = await prisma.$transaction(async tx => {
    const join = await tx.relayJoin.findUnique({ where: { id: joinId } })
    if (!join) throw new ConsoleRefusal('not_found', 'No such code.')
    if (join.state !== 'CLAIMED' || !join.hostFingerprint || !join.hostIdentity || !join.machineName) {
      throw new ConsoleRefusal('not_allowed', 'That code is not waiting for a confirmation.')
    }
    if (join.expiresAt <= now) throw new ConsoleRefusal('not_allowed', 'That code has expired; make a new one.')
    const identity = join.hostIdentity as HostIdentity
    const fields = {
      signingKey: identity.signingKey,
      sealingKey: identity.sealingKey,
      machineName: join.machineName,
      consoleFingerprint,
      credentialHash: hashCredential(machineCredential),
      joinedAt: now,
      lastSeenAt: null,
      disconnectedAt: null,
    }
    const row = await tx.relayHost.upsert({
      where: { fingerprint: join.hostFingerprint },
      create: { fingerprint: join.hostFingerprint, ...fields },
      update: fields,
    })
    await tx.relayJoin.update({ where: { id: joinId }, data: { state: 'ACCEPTED', relayHostId: row.id } })
    return row
  })
  const peer = { hostId: host.id, fingerprint: host.fingerprint, consoleFingerprint }
  // A machine joining again while an older link of its own is open: the joining connection replaces it (addHost).
  if (!hub.completeJoin(joinId, { hostId: host.id, machineCredential, acceptance }, peer)) {
    await disconnectHost(host.id, now)
    throw new ConsoleRefusal('failed', GONE)
  }
  return { hostId: host.id }
}

export async function endJoin(hub: RelayHub, joinId: string, state: 'REFUSED' | 'CLOSED'): Promise<boolean> {
  const { count } = await prisma.relayJoin.updateMany({ where: { id: joinId, state: { in: ['OPEN', 'CLAIMED'] } }, data: { state } })
  hub.endJoin(joinId, 'refused')
  return count === 1
}

/**
 * A Fleet Console started anew holds none of the codes an earlier start opened, which lived in its memory: each join
 * still open from before `at` is closed, and a machine waiting on one is let go. How many ended.
 */
export async function endJoinsOpenedBefore(hub: RelayHub, at: Date): Promise<number> {
  const open = { in: ['OPEN', 'CLAIMED'] }
  const rows = await prisma.relayJoin.findMany({ where: { state: open, createdAt: { lt: at } }, select: { id: true } })
  if (rows.length === 0) return 0
  const ids = rows.map(r => r.id)
  await prisma.relayJoin.updateMany({ where: { id: { in: ids }, state: open }, data: { state: 'CLOSED' } })
  for (const id of ids) hub.dropJoin(id)
  return ids.length
}
