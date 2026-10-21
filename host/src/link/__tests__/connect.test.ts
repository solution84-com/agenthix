import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JoinRequest } from '@agenthix/core'
import { fingerprintOf, verifyHostJoinBinding } from '@agenthix/core/host-crypto'
import { install } from '../../install/install'
import { hostKeys } from '../../identity/identity'
import { writeSend } from '../../move/record'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import type { Progress } from '../../sockets/lineServer'
import { connectConsole } from '../manage'
import { readPin } from '../pin'
import { FakeConsole, FakeRelay, type Connection } from './fakeRelay'

const CODE = '7KQ4-M2XD-46Q3'
const ADDRESS = 'https://hq.acme.example'
const CREDENTIAL = 'hmc_4f1c2a9e7b3d5e8f0a1b2c3d4e5f6a7b'

let m: FakeMachine
let relay: FakeRelay
let fleetConsole: FakeConsole
let progress: Progress[]
let started: number

beforeEach(async () => {
  m = fakeMachine()
  relay = new FakeRelay()
  fleetConsole = await FakeConsole.make()
  progress = []
  started = 0
  m.ctx.dial = relay.dial
  m.ctx.link = { start: () => { started++ }, stop: () => {}, connected: () => false, sendEnvelope: () => {} }
})
afterEach(() => m.cleanup())

const connect = (signal?: AbortSignal) => connectConsole(m.ctx, ADDRESS, CODE, p => progress.push(p), signal)

/** HQ passes the join to the Fleet Console, the fleet admin confirms, and HQ hands the machine its credential. */
function confirmWith(acceptance: (join: JoinRequest) => Promise<unknown>, credential = CREDENTIAL) {
  relay.onJoin = async (join, conn) => {
    await conn.deliver('host.joined', { hostId: 'h1', machineCredential: credential, acceptance: await acceptance(join) })
  }
}

describe('console connect @SC-845', () => {
  it('shows the fingerprint, pins the Fleet Console only once its binding proves it holds the code, and keeps the link', async () => {
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    const r = await connect()
    expect(r).toMatchObject({ consoleFingerprint: fleetConsole.fingerprint, hqAddress: ADDRESS })
    expect(readPin(m.ctx.state)).toMatchObject({
      consoleFingerprint: fleetConsole.fingerprint, console: fleetConsole.keys.identity, hostId: 'h1', machineCredential: CREDENTIAL, local: false,
    })
    expect(started).toBe(1)
    expect(progress).toContainEqual({ event: 'join', machine: 'hq-box', fingerprint: expect.stringMatching(/^[0-9A-F]{4}( [0-9A-F]{4}){3}$/) })
    expect(progress).toContainEqual(expect.objectContaining({ event: 'joined', hqAddress: ADDRESS }))
  })

  it('never sends the code to HQ: only the lookup derived from it, and a binding over its own fingerprint', async () => {
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    const conn: Connection = relay.connections[0]
    expect(conn.url).toBe('wss://hq.acme.example/host-link')
    const join = conn.sent.find(f => f.type === 'host.join')!.payload as JoinRequest
    expect(conn.headers['X-Host-Join']).toBe(join.lookup)
    const seen = JSON.stringify(relay.connections)
    for (const form of [CODE, CODE.replace(/-/g, ''), CODE.toLowerCase()]) expect(seen).not.toContain(form)
  })

  it('pins nothing when HQ puts its own key in the Fleet Console’s place, whatever binding it sends', async () => {
    const hq = await FakeConsole.make()
    for (const forged of [
      async (join: JoinRequest) => ({ identity: hq.keys.identity, binding: (await fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity)).binding }),
      async (join: JoinRequest) => hq.acceptance('ZZZZZZZZZZZZ', join.identity),
      async () => ({ identity: hq.keys.identity, binding: 'A'.repeat(43) }),
    ]) {
      confirmWith(forged)
      await expect(connect()).rejects.toMatchObject({ message: expect.stringContaining('did not prove it came from the Fleet Console') })
      expect(readPin(m.ctx.state)).toBeNull()
    }
    expect(started).toBe(0)
  })

  it('pins nothing when the credential HQ hands over is not one', async () => {
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity), 'not a credential')
    await expect(connect()).rejects.toBeTruthy()
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('says so in words, keeping nothing, when the code ran out, was used, or HQ does not take it', async () => {
    relay.onJoin = (_join, conn) => conn.deliver('host.joinRefused', { reason: 'expired' })
    await expect(connect()).rejects.toThrow('Refused: that code has expired or was already used. Ask a fleet admin for a new one: Fleet Console → Fleet → Add a site.')
    relay.refuse = true
    await expect(connect()).rejects.toThrow(/has expired or was already used/)
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('gives up when HQ goes quiet while a fleet admin is still to confirm', async () => {
    const { joinConsole } = await import('../join')
    const outcome = await joinConsole({
      address: ADDRESS, code: CODE, keys: await hostKeys(m.ctx.state), machineName: 'hq-box', dial: relay.dial, now: m.ctx.now, quietMs: 60,
    })
    expect(outcome).toEqual({ ok: false, reason: 'closed' })
  })

  it('stops when the machine admin presses Ctrl-C, and a confirmation after it pins nothing', async () => {
    const stop = new AbortController()
    const pending: { later: (() => Promise<void>) | null } = { later: null }
    relay.onJoin = (join, conn) => {
      pending.later = async () => conn.deliver('host.joined', { hostId: 'h1', machineCredential: CREDENTIAL, acceptance: await fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity) })
    }
    const running = connect(stop.signal)
    while (!pending.later) await new Promise(r => setTimeout(r, 0))
    stop.abort()
    await expect(running).rejects.toThrow('Stopped. Nothing was kept.')
    await pending.later!()
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('refuses a machine that already has a controller: one at a time', async () => {
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    await expect(connect()).rejects.toThrow(/already managed by a Fleet Console .* agenthix console disconnect/)
  })

  it('refuses plain http across a network, which would carry the machine credential unencrypted', async () => {
    await expect(connectConsole(m.ctx, 'http://hq.acme.example', CODE, () => {})).rejects.toThrow(/plain http/)
    expect(relay.connections).toEqual([])
  })
})

describe('the claim "this machine runs HQ" @SC-846', () => {
  const sentJoin = () => relay.connections[0].sent.find(f => f.type === 'host.join')!.payload as JoinRequest
  const bindingSays = async (join: JoinRequest, claims: { runsHq?: true }) =>
    verifyHostJoinBinding(CODE.replace(/-/g, ''), await fingerprintOf((await hostKeys(m.ctx.state)).identity), join.binding, claims)

  /** HQ's machine after `hq console-code --no-machines`: its Fleet Console ran elsewhere and is gone. */
  async function hqHere(): Promise<void> {
    await install(m.ctx, ADDRESS, () => {})
    fs.rmSync(m.ctx.state.path('console'), { recursive: true, force: true })
  }

  it('is made by the host service that runs HQ, under the binding, so HQ can neither add it nor drop it', async () => {
    await hqHere()
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    const join = sentJoin()
    expect(join.runsHq).toBe(true)
    expect(await bindingSays(join, { runsHq: true })).toBe(true)
    expect(await bindingSays(join, {})).toBe(false)
  })

  it('is never made by a machine that runs no HQ', async () => {
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    const join = sentJoin()
    expect(join.runsHq).toBeUndefined()
    expect(await bindingSays(join, {})).toBe(true)
  })

  it('is not made once HQ has moved from this machine to another, its copy here kept only until removed', async () => {
    await hqHere()
    const peer = await FakeConsole.make()
    const installedAt = (m.ctx.state.readJson('hq', 'settings.json') as { installedAt: string }).installedAt
    writeSend(m.ctx.state, {
      transferId: 'transfer-hq-0001', peer: peer.fingerprint, peerIdentity: peer.keys.identity as never, phase: 'committed',
      releasedAt: 1, deadline: 2, reason: null, target: 'hq', installedAt,
    })
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    expect(sentJoin().runsHq).toBeUndefined()
  })

  it('is made for an HQ installed here after an earlier one moved away', async () => {
    await hqHere()
    const peer = await FakeConsole.make()
    writeSend(m.ctx.state, {
      transferId: 'transfer-hq-0001', peer: peer.fingerprint, peerIdentity: peer.keys.identity as never, phase: 'removed',
      releasedAt: 1, deadline: 2, reason: null, target: 'hq', installedAt: '2026-10-01T00:00:00.000Z',
    })
    confirmWith(join => fleetConsole.acceptance(CODE.replace(/-/g, ''), join.identity))
    await connect()
    expect(sentJoin().runsHq).toBe(true)
  })
})
