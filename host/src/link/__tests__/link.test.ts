import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { HostLink } from '../link'
import { forgetPin, writePin } from '../pin'
import { FakeConsole, FakeRelay } from './fakeRelay'

let m: FakeMachine
let relay: FakeRelay
let link: HostLink
let envelopes: unknown[]
let revoked: number

beforeEach(async () => {
  vi.useFakeTimers()
  m = fakeMachine()
  relay = new FakeRelay()
  envelopes = []
  revoked = 0
  const fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  link = new HostLink({
    state: m.ctx.state, dial: relay.dial, log: () => {}, random: () => 0,
    onEnvelope: async e => { envelopes.push(e) },
    onRevoke: async () => { revoked++ },
  })
})
afterEach(() => {
  link.stop()
  vi.useRealTimers()
  m.cleanup()
})

const settle = () => vi.advanceTimersByTimeAsync(1)

describe('the link to HQ’s relay @SC-851', () => {
  it('dials out to /host-link with the machine credential, and nothing else', async () => {
    link.start()
    await settle()
    expect(relay.connections).toHaveLength(1)
    expect(relay.last.url).toBe('wss://hq.acme.example/host-link')
    expect(relay.last.headers).toEqual({ Authorization: 'Bearer hmc_0123456789abcdef' })
    expect(link.connected()).toBe(true)
  })

  it('answers ping, passes envelopes on, and takes revoke', async () => {
    link.start()
    await settle()
    void relay.last.deliver('ping', {})
    void relay.last.deliver('relay.envelope', { envelope: { v: 1 } })
    void relay.last.deliver('revoke', {})
    await settle()
    expect(relay.last.sent.map(f => f.type)).toEqual(['pong'])
    expect(envelopes).toEqual([{ v: 1 }])
    expect(revoked).toBe(1)
  })

  it('opens again with growing waits when the connection drops', async () => {
    link.start()
    await settle()
    relay.last.drop()
    expect(link.connected()).toBe(false)
    await vi.advanceTimersByTimeAsync(499)
    expect(relay.connections).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(relay.connections).toHaveLength(2)
    relay.refuse = true
    relay.last.drop()
    await vi.advanceTimersByTimeAsync(501)
    expect(relay.connections).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(999)
    expect(relay.connections).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(2)
    expect(relay.connections).toHaveLength(4)
  })

  it('takes a silent connection for dead, and opens it again', async () => {
    link.start()
    await settle()
    await vi.advanceTimersByTimeAsync(89_000)
    expect(relay.connections).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(32_000)
    expect(relay.connections).toHaveLength(2)
  })

  it('stays closed once stopped, and does not open without a pin', async () => {
    link.start()
    await settle()
    link.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(relay.connections).toHaveLength(1)
    forgetPin(m.ctx.state)
    link.start()
    await settle()
    expect(relay.connections).toHaveLength(1)
  })
})
