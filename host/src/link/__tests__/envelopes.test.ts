import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostEnvelope, HostMessage, HostRequest, HostResult } from '@agenthix/core'
import { EnvelopeReplayGuard, generateHostKeys } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { envelopeHandler } from '../envelopes'
import { forgetPin, writePin } from '../pin'
import { FakeConsole } from './fakeRelay'

let m: FakeMachine
let fleetConsole: FakeConsole
let sent: HostEnvelope[]
let asked: { request: HostRequest; by: unknown }[]
let handle: (data: unknown) => Promise<void>
const t0 = Date.parse('2026-10-14T09:00:00Z')
let now = t0
const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const

beforeEach(async () => {
  m = fakeMachine()
  now = t0
  fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: new Date(t0).toISOString(), local: false,
  })
  sent = []
  asked = []
  handle = envelopeHandler({
    state: m.ctx.state,
    keys: () => hostKeys(m.ctx.state),
    replay: new EnvelopeReplayGuard(t0 - 120_000),
    operate: async (request, by): Promise<HostResult> => {
      asked.push({ request, by })
      return { ok: true, op: 'figures.read', result: { machine: { name: 'office-server' } } as never }
    },
    send: e => { sent.push(e) },
    now: () => now,
  })
})
afterEach(() => m.cleanup())

const host = async () => (await hostKeys(m.ctx.state)).identity
const request = (req: unknown, by: unknown = fleetAdmin): HostMessage => ({ kind: 'request', requestId: 'r1', by, request: req } as HostMessage)
const answers = async () => Promise.all(sent.map(async e => (await fleetConsole.open(e, await host(), now))))
const resultOf = async () => {
  const [opened] = await answers()
  expect(opened.ok).toBe(true)
  return (opened as { message: { kind: string; replyTo: string; result: HostResult } }).message
}

describe('an envelope from the pinned Fleet Console @SC-847', () => {
  it('asks the closed set on behalf of the fleet admin it names, and the answer goes back sealed to it', async () => {
    await handle(await fleetConsole.seal(await host(), request({ op: 'figures.read' }), now))
    expect(asked).toEqual([{ request: { op: 'figures.read' }, by: fleetAdmin }])
    const answer = await resultOf()
    expect(answer).toMatchObject({ kind: 'result', replyTo: 'r1', result: { ok: true, op: 'figures.read' } })
    expect(sent[0].to).toBe(fleetConsole.fingerprint)
  })

  it('cannot ask what stays on the machine: each CLI-only operation is refused, and nothing acts @SC-830', async () => {
    for (const op of [
      { op: 'machine.install', address: 'https://evil.example' }, { op: 'hq.resetPassword', user: 'sam' }, { op: 'hq.inviteAdmin' },
      { op: 'hq.fleetAdmin', user: 'mallory' }, { op: 'hq.consoleCode' }, { op: 'console.disconnect' },
      { op: 'console.connect', address: 'https://evil.example', code: '7KQ4M2XD46Q3' }, { op: 'console.install', address: 'https://evil.example', code: '7KQ4M2XD46Q3' },
      { op: 'console.remove', confirmed: true },
      { op: 'backup.location', path: '/mnt/evil' }, { op: 'backup.saveKey' }, { op: 'upgrades.hostSwitch' }, { op: 'erased.restore', target: 'hq' },
      { op: 'machine.status' }, { op: 'shell', command: 'rm -rf /' },
    ]) {
      sent = []
      await handle(await fleetConsole.seal(await host(), request(op), now))
      const answer = await resultOf()
      expect(answer.result).toMatchObject({ ok: false, refusal: { code: 'unknown_operation' } })
    }
    expect(asked).toEqual([])
  })

  it('must name a fleet admin: it cannot speak as the machine admin, Cloud or the maintenance window', async () => {
    for (const by of [{ kind: 'machineAdmin' }, { kind: 'cloud' }, { kind: 'maintenanceWindow' }, null]) {
      sent = []
      await handle(await fleetConsole.seal(await host(), request({ op: 'figures.read' }, by), now))
      expect((await resultOf()).result).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    }
    expect(asked).toEqual([])
  })
})

describe('an envelope that is refused, with nothing acting on it @SC-847', () => {
  it('from a key that is not pinned', async () => {
    const other = await FakeConsole.make()
    await handle(await other.seal(await host(), request({ op: 'figures.read' }), now))
    expect(asked).toEqual([])
    expect(sent).toEqual([])
  })

  it('from a Cloud identity: no Cloud controller is pinned while its crossing is a scaffold', async () => {
    const cloud = await FakeConsole.make('cloud')
    await handle(await cloud.seal(await host(), request({ op: 'figures.read' }), now))
    expect(asked).toEqual([])
  })

  it('made up or changed by HQ: the pinned fingerprint on its own envelope, or another body under the real signature', async () => {
    const real = await fleetConsole.seal(await host(), request({ op: 'figures.read' }), now)
    const hq = await FakeConsole.make()
    const own = await hq.seal(await host(), request({ op: 'stop', target: 'site' }), now)
    await handle({ ...own, from: fleetConsole.fingerprint })
    await handle({ ...real, ct: own.ct, epk: own.epk, iv: own.iv })
    expect(asked).toEqual([])
  })

  it('a second time: a replayed id', async () => {
    const env = await fleetConsole.seal(await host(), request({ op: 'stop', target: 'site' }), now)
    await handle(env)
    await handle(env)
    expect(asked).toHaveLength(1)
  })

  it('once expired', async () => {
    const env = await fleetConsole.seal(await host(), request({ op: 'stop', target: 'site' }), now, 60_000)
    now += 61_000
    await handle(env)
    expect(asked).toEqual([])
  })

  it('after the machine disconnected', async () => {
    const env = await fleetConsole.seal(await host(), request({ op: 'stop', target: 'site' }), now)
    forgetPin(m.ctx.state)
    await handle(env)
    expect(asked).toEqual([])
    expect(sent).toEqual([])
  })

  it('sealed to another machine', async () => {
    const elsewhere = (await generateHostKeys('host')).identity
    await handle(await fleetConsole.seal(elsewhere, request({ op: 'stop', target: 'site' }), now))
    expect(asked).toEqual([])
  })

  it('that is not an envelope at all', async () => {
    for (const junk of [null, 'stop', { op: 'stop', target: 'site' }, { v: 1 }]) await handle(junk)
    expect(asked).toEqual([])
  })
})
