/**
 * The public address hq sees this machine from (core's `HqSeenFromFrame`; live preview spec section 6): taken from
 * the host link, kept when it is public, fed to the rules so `public-address` is written, and said in the figures, so
 * the site needs that rule before a live preview starts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunResult } from '../../docker/docker'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { HostLink } from '../../link/link'
import { writePin } from '../../link/pin'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'
import { Firewall } from '../firewall'
import { machineRules, type MachineFacts } from '../machine'
import { AgentProtections } from '../protections'
import { isPublicIpv4, readPublicAddresses, recordPublicAddress } from '../publicAddress'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const now = new Date('2026-11-02T09:00:00Z')

describe('the address hq sees this machine from @SC-1758', () => {
  it('means something only when the public internet routes it', () => {
    expect(isPublicIpv4('203.0.113.7')).toBe(true)
    for (const a of ['10.1.2.3', '172.20.0.1', '192.168.1.1', '100.100.1.1', '127.0.0.1', '169.254.169.254', '::1', '2001:db8::1', 'x', '']) {
      expect(isPublicIpv4(a)).toBe(false)
    }
  })

  it('is kept when public, newest first, at most four, and says when it changed', () => {
    expect(recordPublicAddress(m.ctx.state, '203.0.113.7', now)).toBe(true)
    expect(recordPublicAddress(m.ctx.state, '203.0.113.7', now)).toBe(false)
    for (const a of ['198.51.100.1', '198.51.100.2', '198.51.100.3', '198.51.100.4']) recordPublicAddress(m.ctx.state, a, now)
    expect(readPublicAddresses(m.ctx.state)).toEqual(['198.51.100.4', '198.51.100.3', '198.51.100.2', '198.51.100.1'])
  })

  it('is not kept when it is private, IPv6, or not an address at all', () => {
    for (const a of ['192.168.1.20', '2001:db8::1', '1.2.3.4; flush ruleset', 42, null]) expect(recordPublicAddress(m.ctx.state, a, now)).toBe(false)
    expect(readPublicAddresses(m.ctx.state)).toEqual([])
  })

  it('ignores a record someone edited to hold something else', () => {
    m.ctx.state.writeJson(['link', 'public-address.json'], { addresses: ['10.0.0.1', '1.2.3.4 } drop', '203.0.113.7'] })
    expect(readPublicAddresses(m.ctx.state)).toEqual(['203.0.113.7'])
  })
})

describe('the rules, once an address is known @SC-1758', () => {
  const facts: MachineFacts = { interfaces: () => ['lo', 'eth0', 'docker0'], kernel: () => '6.8.0-45-generic', lookup: async () => [] }

  it('close it to live previews', async () => {
    const rules = machineRules('agenthix', () => '10.213.16.0/20', facts, () => readPublicAddresses(m.ctx.state))
    expect(await rules()).toMatchObject({ livePreview: { publicAddresses: [] } })
    recordPublicAddress(m.ctx.state, '203.0.113.7', now)
    expect(await rules()).toMatchObject({ livePreview: { publicAddresses: ['203.0.113.7'] } })
  })

  it('tell the site an address is known, so it needs public-address before a live preview starts', async () => {
    const fail: RunResult = { code: 1, stdout: '', stderr: 'Error: No such file or directory' }
    const firewall = new Firewall(async args => (args[0] === '-f' ? { code: 0, stdout: '', stderr: '' } : fail))
    const set = { table: 'agenthix_agents', range: { addr: '10.213.16.0', len: 20 }, machineAddresses: [] }
    const part = { addr: '10.213.24.0', len: 21 }
    const unknown = new AgentProtections(firewall, async () => ({ ...set, livePreview: { part, publicAddresses: [] } }), () => now)
    expect(await unknown.check()).toMatchObject({ publicAddressKnown: false })
    const known = new AgentProtections(firewall, async () => ({ ...set, livePreview: { part, publicAddresses: ['203.0.113.7'] } }), () => now)
    expect(await known.check()).toMatchObject({ publicAddressKnown: true, holding: false })
  })
})

describe('hq.seenFrom on the host link @SC-1758', () => {
  it('is passed on as hq said it', async () => {
    vi.useFakeTimers()
    try {
      const relay = new FakeRelay()
      const fleetConsole = await FakeConsole.make()
      writePin(m.ctx.state, {
        console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
        hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
      })
      const seen: unknown[] = []
      const link = new HostLink({
        state: m.ctx.state, dial: relay.dial, log: () => {}, random: () => 0,
        onEnvelope: async () => {}, onRevoke: async () => {}, onSeenFrom: a => seen.push(a),
      })
      link.start()
      await vi.advanceTimersByTimeAsync(1)
      void relay.last.deliver('hq.seenFrom', { address: '203.0.113.7' })
      await vi.advanceTimersByTimeAsync(1)
      expect(seen).toEqual(['203.0.113.7'])
      expect(relay.last.sent).toEqual([])
      link.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
