import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HostEnvelope, HostResult, ScheduledChangeNotice } from '@agenthix/core'
import { EnvelopeReplayGuard } from '@agenthix/core/host-crypto'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { hostKeys } from '../../identity/identity'
import { install } from '../../install/install'
import { envelopeHandler } from '../../link/envelopes'
import { writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { cancelScheduled, scheduleChange, tickScheduled } from '../scheduler'

// A scheduled change reaches the Fleet Console the machine pins (spec §14): each new notice is sent sealed to it over
// the link, and every notice still held is offered again whenever it reads the machine's figures — after its own
// restart, or a link that was down.

const MIN = 60_000
const small = { memoryBytesPerContainer: 512 * 1024 ** 2, cpusPerContainer: 1, processesPerContainer: 256, containersAtOnce: 1 }
const resize = { op: 'capacity.set' as const, ceilings: small }
const machineAdmin = { kind: 'machineAdmin' as const }
const fleetAdmin = { kind: 'fleetAdmin', userId: 'u1', name: 'Avery Chen' } as const

let m: FakeMachine
let fleetConsole: FakeConsole
let sent: HostEnvelope[]
let up: boolean
const inMinutes = (n: number) => new Date(m.ctx.now().getTime() + n * MIN).toISOString()

async function noticesSent(): Promise<ScheduledChangeNotice[]> {
  const host = (await hostKeys(m.ctx.state)).identity
  const out: ScheduledChangeNotice[] = []
  for (const e of sent) {
    const opened = await fleetConsole.open(e, host, m.ctx.now().getTime())
    expect(opened.ok).toBe(true)
    const message = opened.ok ? (opened.message as { kind: string; notice?: ScheduledChangeNotice }) : null
    if (message?.kind === 'scheduledChange') out.push(message.notice!)
  }
  return out
}

beforeEach(async () => {
  m = fakeMachine()
  m.ctx.state.writeJson(['site', 'settings.json'], { name: 'office-server', version: '0.2.0', installedAt: '2026-10-01T00:00:00Z' })
  fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  sent = []
  up = true
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => up, sendEnvelope: e => { if (up) sent.push(e) } }
})
afterEach(() => m.cleanup())

describe('a scheduled change and the Fleet Console @SC-839', () => {
  it('is sent to it, sealed and signed, as soon as it is scheduled, and again as it moves on', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await tickScheduled(m.ctx)
    expect((await noticesSent()).map(n => [n.update, n.change.id])).toEqual([['scheduled', change.id]])
    expect(sent.every(e => e.to === fleetConsole.fingerprint)).toBe(true)

    await cancelScheduled(m.ctx, change.id)
    await tickScheduled(m.ctx)
    expect((await noticesSent()).map(n => n.update)).toEqual(['scheduled', 'cancelled'])
  })

  it('is sent from HQ’s machine too, beside what HQ hears through its control socket', async () => {
    m.ctx.state.writeJson(['site', 'settings.json'], null)
    await install(m.ctx, 'https://hq.acme.example', () => {})
    m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
    await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await tickScheduled(m.ctx)
    expect((await noticesSent()).map(n => n.update)).toEqual(['scheduled'])
  })

  it('waits while the link is down, and is sent once it is up', async () => {
    up = false
    await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await tickScheduled(m.ctx)
    expect(sent).toEqual([])
    up = true
    await tickScheduled(m.ctx)
    await tickScheduled(m.ctx)
    expect((await noticesSent()).map(n => n.update)).toEqual(['scheduled'])
  })

  it('is offered again, every one held, when the Fleet Console reads the figures', async () => {
    await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await scheduleChange(m.ctx, resize, inMinutes(90), machineAdmin)
    await tickScheduled(m.ctx)
    sent = []
    const now = m.ctx.now().getTime()
    const handle = envelopeHandler({
      state: m.ctx.state,
      keys: () => hostKeys(m.ctx.state),
      replay: new EnvelopeReplayGuard(now - 120_000),
      operate: async (): Promise<HostResult> => ({ ok: true, op: 'figures.read', result: { machine: { name: 'office-server' } } as never }),
      send: e => { sent.push(e) },
      now: () => now,
    })
    const host = (await hostKeys(m.ctx.state)).identity
    await handle(await fleetConsole.seal(host, { kind: 'request', requestId: 'r1', by: fleetAdmin, request: { op: 'figures.read' } }, now))
    expect((await noticesSent()).map(n => n.change.id).sort()).toEqual(['1', '2'])
  })
})
