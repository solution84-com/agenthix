import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ScheduledChangeNotice } from '@agenthix/core'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { forgetConsole } from '../../link/manage'
import { writePin } from '../../link/pin'
import { FakeConsole } from '../../link/__tests__/fakeRelay'
import { listScheduled, scheduleChange, tickScheduled } from '../scheduler'
import { readStore } from '../store'

// A machine's scheduled changes do not outlive what they were for: when the HQ or site a change targets is no
// longer on the machine — erased, removed, moved away, or replaced by a new one — or the machine is disconnected,
// each open change ends as cancelled, with the reason, so HQ and the Fleet Console are told.

const MIN = 60_000
const small = { memoryBytesPerContainer: 512 * 1024 ** 2, cpusPerContainer: 1, processesPerContainer: 256, containersAtOnce: 1 }
const resize = { op: 'capacity.set' as const, ceilings: small }
const machineAdmin = { kind: 'machineAdmin' as const }
const SITE = { name: 'office-server', version: '0.2.0', installedAt: '2026-10-01T00:00:00Z' }

let m: FakeMachine
const inMinutes = (n: number) => new Date(m.ctx.now().getTime() + n * MIN).toISOString()
const lastNotice = (id: string): ScheduledChangeNotice | null =>
  readStore(m.ctx.state).entries.find(e => e.change.id === id)?.notice ?? null

beforeEach(() => {
  m = fakeMachine()
  m.ctx.state.writeJson(['site', 'settings.json'], SITE)
})
afterEach(() => m.cleanup())

describe('a scheduled change whose site is gone @SC-841', () => {
  it('ends as cancelled, with the reason, once the site is no longer on the machine', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    fs.rmSync(m.ctx.state.path('site'), { recursive: true, force: true })
    await tickScheduled(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(lastNotice(change.id)).toMatchObject({
      update: 'cancelled',
      change: { state: 'cancelled' },
      reason: 'The resize of the site office-server was cancelled: the site office-server is no longer on hq-box.',
    })
  })

  it('ends as cancelled when a new site took its place on the machine', async () => {
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    m.ctx.state.writeJson(['site', 'settings.json'], { ...SITE, name: 'new-site', installedAt: '2026-10-14T08:00:00Z' })
    expect(listScheduled(m.ctx)).toEqual([])
    await tickScheduled(m.ctx)
    expect(lastNotice(change.id)).toMatchObject({ update: 'cancelled', reason: expect.stringContaining('no longer on hq-box') })
  })

  it('keeps a change while its site stays, through a restart of the host service', async () => {
    await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await tickScheduled(m.ctx)
    expect(listScheduled(m.ctx).map(c => c.state)).toEqual(['scheduled'])
  })
})

describe('a scheduled change whose HQ is gone @SC-841', () => {
  it('ends as cancelled, with the reason, once HQ is no longer on the machine', async () => {
    m.ctx.state.writeJson(['site', 'settings.json'], null)
    await install(m.ctx, 'https://hq.acme.example', () => {})
    m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    for (const part of ['hq', 'site']) fs.rmSync(m.ctx.state.path(part), { recursive: true, force: true })
    await tickScheduled(m.ctx)
    expect(lastNotice(change.id)).toMatchObject({ update: 'cancelled', reason: expect.stringContaining('is no longer on hq-box') })
  })
})

describe('a machine disconnected from its Fleet Console @SC-841', () => {
  it('cancels every open change, with the reason', async () => {
    const fleetConsole = await FakeConsole.make()
    writePin(m.ctx.state, {
      console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
      hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
    })
    m.ctx.link = { start: () => {}, stop: () => {}, connected: () => false, sendEnvelope: () => {} }
    const change = await scheduleChange(m.ctx, resize, inMinutes(60), machineAdmin)
    await forgetConsole(m.ctx)
    expect(listScheduled(m.ctx)).toEqual([])
    expect(lastNotice(change.id)).toMatchObject({
      update: 'cancelled',
      reason: 'The resize of the site office-server was cancelled: hq-box was disconnected from its Fleet Console.',
    })
  })
})
