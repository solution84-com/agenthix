import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CloudControllerBinding, HostEnvelope, HostIdentity, HostRequest, HostResult } from '@agenthix/core'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { envelopeHandler } from '../envelopes'
import {
  cloudEnrolmentRefusal, consoleRefusedForCloud, enrolledWithCloud, pinCloudController, readCloudBinding,
} from '../cloudController'
import { connectConsole } from '../manage'
import { cloudSettings } from '../../config'
import { joinLocalConsole } from '../localConsole'
import { readPin, writePin } from '../pin'
import { FakeConsole, FakeRelay } from './fakeRelay'
import { withFeature } from '@agenthix/core/testing'

let m: FakeMachine
let cloud: FakeConsole
let asked: HostRequest[]
let sent: HostEnvelope[]
let logs: string[]
const t0 = Date.parse('2026-10-14T09:00:00Z')

const handler = () => envelopeHandler({
  state: m.ctx.state, keys: () => hostKeys(m.ctx.state), replay: new EnvelopeReplayGuard(t0 - 120_000),
  operate: async (request): Promise<HostResult> => { asked.push(request); return { ok: true, op: 'figures.read', result: {} as never } },
  send: e => { sent.push(e) }, now: () => t0, log: l => logs.push(l),
})

const binding = (): CloudControllerBinding => ({
  identity: cloud.keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: new Date(t0).toISOString(),
})

async function pinFleetConsole(): Promise<FakeConsole> {
  const fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: new Date(t0).toISOString(), local: false,
  })
  return fleetConsole
}

beforeEach(async () => {
  m = fakeMachine()
  cloud = await FakeConsole.make('cloud')
  asked = []
  sent = []
  logs = []
})
afterEach(() => m.cleanup())

describe('the Cloud controller this machine pins @SC-1058', () => {
  it('is pinned with the machine id Cloud knows it by, at 0600', async () => {
    expect(await pinCloudController(m.ctx.state, binding())).toEqual({ ok: true })
    expect(readCloudBinding(m.ctx.state)).toEqual(binding())
    expect(enrolledWithCloud(m.ctx.state)).toBe(true)
  })

  it('is refused while a Fleet Console is pinned: one controller at a time', async () => {
    await pinFleetConsole()
    expect(cloudEnrolmentRefusal(m.ctx.state)?.code).toBe('conflict')
    const r = await pinCloudController(m.ctx.state, binding())
    expect(r.ok).toBe(false)
    expect(readCloudBinding(m.ctx.state)).toBeNull()
  })

  it('is never replaced by another Cloud identity', async () => {
    await pinCloudController(m.ctx.state, binding())
    const other = await FakeConsole.make('cloud')
    const r = await pinCloudController(m.ctx.state, { ...binding(), identity: other.keys.identity as HostIdentity & { role: 'cloud' } })
    expect(r.ok).toBe(false)
    expect(readCloudBinding(m.ctx.state)?.identity).toEqual(cloud.keys.identity)
  })

  it('a record that is not a Cloud binding is none', () => {
    m.ctx.state.writeJson(['link', 'cloud.json'], { identity: { role: 'console' } })
    expect(readCloudBinding(m.ctx.state)).toBeNull()
    m.ctx.state.writeJson(['link', 'cloud.json'], { ...binding(), machineId: 'a b' })
    expect(readCloudBinding(m.ctx.state)).toBeNull()
  })
})

describe('a machine set up for Cloud while Agenthix Cloud is off (adr-0189) @SC-2129', () => {
  it('is one the organisation runs itself: Cloud\'s settings are ignored, and a Fleet Console is not refused for them', () => {
    expect(cloudSettings({ CLOUD_URL: 'https://cloud.example', CLOUD_MACHINE_ID: 'machine-1' })).toBeNull()
    expect(consoleRefusedForCloud(m.ctx.state, { CLOUD_URL: 'https://cloud.example' })).toBeNull()
  })
})

withFeature('cloud', () => {
  describe('a machine Cloud manages refuses a Fleet Console @B5 @SC-1058', () => {
    it('refuses console connect once enrolled', async () => {
      await pinCloudController(m.ctx.state, binding())
      const relay = new FakeRelay()
      m.ctx.dial = relay.dial
      await expect(connectConsole(m.ctx, 'https://hq.acme.example', '7KQ4-M2XD-46Q3', () => {})).rejects.toMatchObject({ code: 'conflict' })
      expect(relay.connections).toEqual([])
      expect(readPin(m.ctx.state)).toBeNull()
    })

    it('refuses it on a machine set up for Cloud, before its enrolment completes', () => {
      expect(consoleRefusedForCloud(m.ctx.state, {})).toBeNull()
      expect(consoleRefusedForCloud(m.ctx.state, { CLOUD_URL: 'https://cloud.example' })).toContain('Agenthix Cloud')
    })

    it('the Fleet Console beside hq claims nothing: the machine does not even ask it for a code', async () => {
      await pinCloudController(m.ctx.state, binding())
      m.consoleLocalJoin.code = '9TR2-WW4C-D25V'
      expect(await joinLocalConsole(m.ctx, 1_000)).toBe(false)
      expect(m.calls.some(c => c.includes('local-join'))).toBe(false)
      expect(readPin(m.ctx.state)).toBeNull()
    })
  })
})

describe('the envelopes a Fleet Console sends @SC-1058', () => {
  it('never carry an operation only Cloud may ask', async () => {
    const fleetConsole = await pinFleetConsole()
    const host = (await hostKeys(m.ctx.state)).identity
    const envelope = await fleetConsole.seal(host, {
      kind: 'request', requestId: 'r1', by: { kind: 'fleetAdmin', userId: 'u1', name: 'Avery' },
      request: { op: 'remoteAccess.off' } as never,
    }, t0)
    await handler()(envelope)
    expect(asked).toEqual([])
    const reply = await fleetConsole.open(sent[0], host, t0)
    expect(reply.ok && reply.message).toMatchObject({ kind: 'result', result: { ok: false, refusal: { code: 'unknown_operation' } } })
  })
})

describe('an envelope from the Cloud identity that comes through HQ @SC-1058', () => {
  it('is dropped: Cloud reaches the machine only on its own link', async () => {
    await pinCloudController(m.ctx.state, binding())
    const host = (await hostKeys(m.ctx.state)).identity
    await handler()(await cloud.seal(host, { kind: 'request', requestId: 'r1', by: { kind: 'cloud' }, request: { op: 'figures.read' } } as never, t0))
    expect(asked).toEqual([])
    expect(sent).toEqual([])
    expect(logs[0]).toContain('only on its own link')
  })

  it('from an identity nobody pinned is still refused as an unknown sender', async () => {
    const host = (await hostKeys(m.ctx.state)).identity
    await handler()(await cloud.seal(host, { kind: 'request', requestId: 'r1', by: { kind: 'fleetAdmin', userId: 'u1', name: 'Avery' }, request: { op: 'figures.read' } }, t0))
    expect(asked).toEqual([])
    expect(logs[0]).toContain('unknown_sender')
  })
})
