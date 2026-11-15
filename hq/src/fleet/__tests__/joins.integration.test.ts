/**
 * Connecting a machine, hq's part (host-management spec §6), against the real test database: hq keeps only the
 * lookup's hash; a lookup works once and not after its hour; the machine's credential exists only in the frame that
 * hands it over, and once it is disconnected its link is refused.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { WebSocket } from 'ws'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { fingerprintOf, generateHostKeys, type HostKeys } from '@agenthix/core/host-crypto'
import { acceptJoin, claimJoin, endJoin, endJoinsOpenedBefore, openJoin, recordJoinRequest } from '../joins'
import { authenticateHost, connectedHosts, disconnectHost } from '../hosts'
import { RelayHub } from '../relay/relayHub'
import { knownHost } from '../hosts'

const lookup = 'c'.repeat(64)
const purpose = { kind: 'add' as const }
const inAnHour = () => new Date(Date.now() + 60 * 60_000).toISOString()

let machine: HostKeys
let fleetConsole: HostKeys
beforeAll(async () => {
  machine = await generateHostKeys('host')
  fleetConsole = await generateHostKeys('console')
})

/** A joining connection that keeps what it is sent. */
function fakeSocket() {
  const sent: string[] = []
  const ws = { OPEN: 1, readyState: 1, send: (d: string) => sent.push(d), close: () => {} } as unknown as WebSocket
  return { ws, sent }
}

async function claimedAndAsked(hub: RelayHub) {
  const { joinId } = await openJoin({ lookup, expiresAt: inAnHour(), purpose })
  expect(await claimJoin(lookup)).toMatchObject({ ok: true, joinId })
  const fingerprint = await fingerprintOf(machine.identity)
  expect(await recordJoinRequest(joinId, { fingerprint, identity: machine.identity, machineName: 'office-server' })).toBe(true)
  const socket = fakeSocket()
  hub.addJoining(joinId, socket.ws, peer => hub.addHost(peer, socket.ws))
  return { joinId, socket, fingerprint }
}

describe('a join lookup @SC-925', () => {
  it('is kept only as a hash', async () => {
    await openJoin({ lookup, expiresAt: inAnHour(), purpose })
    expect(JSON.stringify(await prisma.relayJoin.findMany())).not.toContain(lookup)
  })

  it('works once', async () => {
    await openJoin({ lookup, expiresAt: inAnHour(), purpose })
    expect(await claimJoin(lookup)).toMatchObject({ ok: true })
    expect(await claimJoin(lookup)).toEqual({ ok: false, reason: 'used' })
    expect(await claimJoin('d'.repeat(64))).toBeNull()
  })

  it('does not work after it expires, and lasts at most an hour whatever the Fleet Console asks', async () => {
    const now = new Date()
    const { joinId } = await openJoin({ lookup, expiresAt: new Date(now.getTime() + 10 * 3600_000).toISOString(), purpose }, now)
    const row = await prisma.relayJoin.findUniqueOrThrow({ where: { id: joinId } })
    expect(row.expiresAt.getTime()).toBe(now.getTime() + 3600_000)
    expect(await claimJoin(lookup, new Date(now.getTime() + 3600_001))).toEqual({ ok: false, reason: 'expired' })
  })

  it('is told it was refused once the Fleet Console refused or withdrew it', async () => {
    const hub = new RelayHub({ knownHost })
    const { joinId } = await openJoin({ lookup, expiresAt: inAnHour(), purpose })
    expect(await endJoin(hub, joinId, 'CLOSED')).toBe(true)
    expect(await claimJoin(lookup)).toEqual({ ok: false, reason: 'refused' })
  })
})

describe('accepting a machine @SC-925', () => {
  it('hands its credential over on the joining connection only, keeps its hash, and lets it in by it', async () => {
    const hub = new RelayHub({ knownHost })
    const { joinId, socket, fingerprint } = await claimedAndAsked(hub)
    const acceptance = { identity: { ...fleetConsole.identity, role: 'console' as const }, binding: 'm'.repeat(43) }
    const { hostId } = await acceptJoin(hub, joinId, acceptance)

    const joined = JSON.parse(socket.sent[0])
    expect(joined).toMatchObject({ type: 'host.joined', payload: { hostId, acceptance } })
    const credential: string = joined.payload.machineCredential
    expect(credential).toMatch(/^hmc_/)
    expect(JSON.stringify(await prisma.relayHost.findMany())).not.toContain(credential)
    expect(await authenticateHost(credential)).toEqual({ hostId, fingerprint, consoleFingerprint: await fingerprintOf(fleetConsole.identity) })
    expect(hub.isHostOnline(hostId)).toBe(true)
    expect(await connectedHosts()).toEqual([expect.objectContaining({ hostId, machineName: 'office-server' })])

    // Accepted once.
    await expect(acceptJoin(hub, joinId, acceptance)).rejects.toMatchObject({ code: 'failed' })

    expect(await disconnectHost(hostId)).toBe(true)
    expect(await authenticateHost(credential)).toBeNull()
    expect(await connectedHosts()).toEqual([])
  })

  it('refuses when the machine is no longer waiting, and makes no credential', async () => {
    const hub = new RelayHub({ knownHost })
    const { joinId } = await openJoin({ lookup, expiresAt: inAnHour(), purpose })
    await claimJoin(lookup)
    await expect(acceptJoin(hub, joinId, { identity: { ...fleetConsole.identity, role: 'console' as const }, binding: 'm'.repeat(43) })).rejects.toMatchObject({ code: 'failed' })
    expect(await prisma.relayHost.count()).toBe(0)
  })

  it('ends every join open before a Fleet Console started anew, letting its machine go, and keeps the ones it opened since @SC-925', async () => {
    const hub = new RelayHub({ knownHost })
    const { joinId, socket } = await claimedAndAsked(hub)
    let closed = 0
    ;(socket.ws as unknown as { close: () => void }).close = () => { closed++ }
    const waiting = await openJoin({ lookup: 'e'.repeat(64), expiresAt: inAnHour(), purpose })
    const done = await openJoin({ lookup: 'f'.repeat(64), expiresAt: inAnHour(), purpose })
    await prisma.relayJoin.update({ where: { id: done.joinId }, data: { state: 'ACCEPTED' } })
    const startedAt = new Date()
    const since = await openJoin({ lookup: '1'.repeat(64), expiresAt: inAnHour(), purpose })
    // Set apart by a minute, whatever the database's clock says.
    await prisma.relayJoin.updateMany({ where: { id: { in: [joinId, waiting.joinId, done.joinId] } }, data: { createdAt: new Date(startedAt.getTime() - 60_000) } })
    await prisma.relayJoin.update({ where: { id: since.joinId }, data: { createdAt: new Date(startedAt.getTime() + 60_000) } })

    expect(await endJoinsOpenedBefore(hub, startedAt)).toBe(2)
    const state = async (id: string) => (await prisma.relayJoin.findUnique({ where: { id } }))?.state
    expect(await state(joinId)).toBe('CLOSED')
    expect(await state(waiting.joinId)).toBe('CLOSED')
    expect(await state(done.joinId)).toBe('ACCEPTED')
    expect(await state(since.joinId)).toBe('OPEN')
    expect(hub.isJoining(joinId)).toBe(false)
    expect(closed).toBe(1)
    // Let go, not refused: no one refused this machine.
    expect(socket.sent.some(f => f.includes('host.joinRefused'))).toBe(false)
  })
})
