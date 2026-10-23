/**
 * The Fleet Console moving (spec §7), the machine's part: it moves its pin only on a certificate signed by the Fleet
 * Console it pins, and on HQ's machine the Fleet Console that handed over is removed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostEnvelope, HostIdentity } from '@agenthix/core'
import { EnvelopeReplayGuard, signHandoverCertificate } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { install } from '../../install/install'
import { writeAndStartConsole } from '../../install/console'
import { recordPorts } from '../../state/installation'
import { envelopeHandler } from '../envelopes'
import { followHandover, retiredHere, retiringHere } from '../handover'
import { retireHandedOverConsole } from '../localConsole'
import { linkStatus } from '../status'
import { readPin, writePin } from '../pin'
import { HostLink } from '../link'
import { FakeConsole, FakeRelay } from './fakeRelay'

let m: FakeMachine
let old: FakeConsole
let next: FakeConsole
let sent: HostEnvelope[]

beforeEach(async () => {
  m = fakeMachine()
  old = await FakeConsole.make()
  next = await FakeConsole.make()
  sent = []
  pinTo(old)
})
afterEach(() => m.cleanup())

function pinTo(fleetConsole: FakeConsole, local = false) {
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local,
  })
}

const follow = (certificates: unknown) => followHandover({
  state: m.ctx.state, keys: () => hostKeys(m.ctx.state), send: e => sent.push(e), now: () => new Date(),
}, certificates)

const certificate = (from: FakeConsole, to: FakeConsole, machine = 'laptop') => signHandoverCertificate(from.keys, to.keys.identity, machine)

describe('a handover certificate @SC-854', () => {
  it('moves the pin when the pinned Fleet Console signed it, keeping HQ’s address and the machine credential', async () => {
    expect(await follow([await certificate(old, next)])).toEqual([{ from: old.fingerprint, to: next.fingerprint, machineName: 'laptop' }])
    expect(readPin(m.ctx.state)).toMatchObject({
      consoleFingerprint: next.fingerprint, hqAddress: 'https://hq.acme.example', hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', local: false,
    })
    // It tells the new Fleet Console, sealed to it.
    const me = (await hostKeys(m.ctx.state)).identity
    const told = await next.open(sent[0], me)
    expect(told).toMatchObject({ ok: true, message: { kind: 'handedOver', previous: old.fingerprint } })
  })

  it('does nothing when another Fleet Console signed it, or HQ put its own identity in it', async () => {
    const hq = await FakeConsole.make()
    const real = await certificate(old, next)
    expect(await follow([
      await certificate(hq, hq),
      await certificate(next, hq),
      { ...real, to: hq.keys.identity },
      { ...(await certificate(hq, hq)), from: old.fingerprint },
      'not a certificate',
    ])).toEqual([])
    expect(readPin(m.ctx.state)?.consoleFingerprint).toBe(old.fingerprint)
    expect(sent).toEqual([])
  })

  it('follows a chain of moves the machine slept through, and an old one does nothing afterwards', async () => {
    const third = await FakeConsole.make()
    const first = await certificate(old, next)
    await follow([first, await certificate(next, third, 'office-server')])
    expect(readPin(m.ctx.state)?.consoleFingerprint).toBe(third.fingerprint)
    expect(await follow([first])).toEqual([])
    expect(readPin(m.ctx.state)?.consoleFingerprint).toBe(third.fingerprint)
  })

  it('does nothing on a machine that answers no Fleet Console', async () => {
    const { forgetPin } = await import('../pin')
    forgetPin(m.ctx.state)
    expect(await follow([await certificate(old, next)])).toEqual([])
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('leaves the Fleet Console before it no way in: its envelopes are refused, the new one’s accepted', async () => {
    await follow([await certificate(old, next)])
    const asked: unknown[] = []
    const handle = envelopeHandler({
      state: m.ctx.state, keys: () => hostKeys(m.ctx.state), replay: new EnvelopeReplayGuard(Date.now() - 120_000),
      operate: async r => { asked.push(r); return { ok: true, op: 'stop', result: { state: 'stopped' } } }, send: () => {}, now: () => Date.now(),
    })
    const me: HostIdentity = (await hostKeys(m.ctx.state)).identity
    const by = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const
    await handle(await old.seal(me, { kind: 'request', requestId: 'r1', by, request: { op: 'stop', target: 'site' } }))
    expect(asked).toEqual([])
    await handle(await next.seal(me, { kind: 'request', requestId: 'r2', by, request: { op: 'stop', target: 'site' } }))
    expect(asked).toHaveLength(1)
  })
})

describe('on HQ’s machine @SC-854', () => {
  beforeEach(async () => {
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    pinTo(old, true)
    m.calls.length = 0
  })

  it('removes the Fleet Console that ran here once it handed over, with its keys, and says where it runs now', async () => {
    expect(await retireHandedOverConsole(m.ctx)).toBe(false)
    await follow([await certificate(old, next, 'laptop')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(true)
    expect(m.calls.some(c => c[0] === 'compose' && c.includes('agenthix-console') && c.includes('down') && c.includes('--volumes'))).toBe(true)
    expect(retiredHere(m.ctx.state)).toMatchObject({ machineName: 'laptop' })
    const status = await linkStatus(m.ctx)
    expect(status.consoleHere).toBeNull()
    expect(status.retiredHere).toMatchObject({ machineName: 'laptop' })
    expect(status.managedBy).toMatchObject({ local: false })
  })

  it('keeps the Fleet Console here when the move was of another one', async () => {
    pinTo(old, false)
    await follow([await certificate(old, next)])
    expect(await retireHandedOverConsole(m.ctx)).toBe(false)
    expect(m.calls.some(c => c.includes('down'))).toBe(false)
  })
})

describe('on a machine other than HQ’s, where the Fleet Console ran @SC-854', () => {
  beforeEach(async () => {
    recordPorts(m.ctx.state, { console: 7801 })
    await writeAndStartConsole(m.ctx, {
      version: '0.2.0', images: {}, hqAddress: 'https://hq.acme.example', onHqMachine: false, installedAt: '2026-10-14T09:00:00.000Z',
    }, { hqCode: '4HQWN7TEM9S3' })
    m.calls.length = 0
  })
  const says = (fleetConsole: FakeConsole | null) => {
    m.consoleAnswers['handover-status'] = fleetConsole ? { state: 'handedOver', from: 'AAAA', hosts: 3, repinned: 3, fingerprint: fleetConsole.fingerprint } : undefined
  }
  const removed = () => m.calls.some(c => c[0] === 'compose' && c.includes('agenthix-console') && c.includes('down') && c.includes('--volumes'))

  it('removes it, with its keys, once the one here says it holds the key that signed', async () => {
    says(old)
    await follow([await certificate(old, next, 'machine-a')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(true)
    expect(removed()).toBe(true)
    const status = await linkStatus(m.ctx)
    expect(status.consoleHere).toBeNull()
    expect(status.retiredHere).toMatchObject({ machineName: 'machine-a' })
  })

  it('keeps a Fleet Console just installed here, which the machine followed to', async () => {
    says(next)
    await follow([await certificate(old, next, 'machine-b')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(false)
    expect(removed()).toBe(false)
    expect(retiringHere(m.ctx.state)).toBeNull()
    expect((await linkStatus(m.ctx)).retiredHere).toBeNull()
  })

  it('waits while the one here does not answer, and removes it once it does', async () => {
    says(null)
    await follow([await certificate(old, next, 'machine-a')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(false)
    expect(retiringHere(m.ctx.state)).not.toBeNull()
    says(old)
    expect(await retireHandedOverConsole(m.ctx)).toBe(true)
    expect(removed()).toBe(true)
  })

  it('removes it when it signed any move of a chain the machine slept through, naming where it runs at the end', async () => {
    const third = await FakeConsole.make()
    says(next)
    await follow([await certificate(old, next, 'machine-b'), await certificate(next, third, 'machine-c')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(true)
    expect(retiredHere(m.ctx.state)).toMatchObject({ machineName: 'machine-c' })
  })

  it('removes nothing on a certificate the pinned Fleet Console did not sign', async () => {
    says(old)
    const hq = await FakeConsole.make()
    await follow([await certificate(hq, hq)])
    expect(retiringHere(m.ctx.state)).toBeNull()
    expect(await retireHandedOverConsole(m.ctx)).toBe(false)
    expect(removed()).toBe(false)
  })
})

describe('the link to HQ @SC-854', () => {
  it('follows the certificates HQ hands it, and sends the new Fleet Console word along the link', async () => {
    const relay = new FakeRelay()
    const link = new HostLink({
      state: m.ctx.state, dial: relay.dial, log: () => {}, random: () => 0, onEnvelope: async () => {}, onRevoke: async () => {},
    })
    link.start()
    await until(() => link.connected())
    await relay.last.deliver('console.handover', { certificates: [await certificate(old, next)] })
    await until(() => readPin(m.ctx.state)?.consoleFingerprint === next.fingerprint)
    await until(() => relay.last.sent.some(f => f.type === 'relay.envelope'))
    link.stop()
  })
})

async function until(check: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('Timed out waiting')
    await new Promise(r => setTimeout(r, 5))
  }
}
