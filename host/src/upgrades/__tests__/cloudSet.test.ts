import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { pinCloudController } from '../../link/cloudController'
import { cloudOperation } from '../../cloud/dispatch'
import { listScheduled } from '../../scheduled/scheduler'
import { generateHostKeys } from '@agenthix/core/host-crypto'
import type { HostIdentity } from '@agenthix/core'
import { upgradesTick } from '../automatic'
import { nextWindowStart, readUpgrades, windowText } from '../settings'
import { instantOf } from '../zoned'
import '../operations'

let m: FakeMachine
const HQ_PARTS = ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor']
const window = (over: object = {}) => ({ day: null, startMinute: 120, endMinute: 240, timeZone: 'America/New_York', ...over })
const ask = (r: object) => cloudOperation(m.ctx, r)

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  for (const part of HQ_PARTS) m.tags.set(`solution84-com/agenthix-${part}`, ['latest', '0.2.0', '0.2.1'])
  m.tags.set('solution84-com/agenthix-host', ['0.2.0', '0.2.1'])
  const keys = await generateHostKeys('cloud')
  await pinCloudController(m.ctx.state, { identity: keys.identity as HostIdentity & { role: 'cloud' }, machineId: 'machine-1', pinnedAt: new Date().toISOString() })
})
afterEach(() => m.cleanup())

describe('a window in a time zone @SC-1064', () => {
  it('starts at the zone’s hour, across the change of clocks', () => {
    const w = { day: null, startMinute: 120, endMinute: 240, timeZone: 'America/New_York' }
    // 2026-03-08 02:00 does not exist in New York (clocks go forward): the window starts at 03:00 EDT.
    expect(nextWindowStart(w, new Date('2026-03-07T12:00:00Z'), 3600_000).toISOString()).toBe('2026-03-08T07:00:00.000Z')
    expect(nextWindowStart(w, new Date('2026-03-08T12:00:00Z'), 3600_000).toISOString()).toBe('2026-03-09T06:00:00.000Z')
    // 02:00 is 07:00 UTC in winter (EST) and 06:00 UTC in summer (EDT), so the instant moves and the hour does not.
    expect(nextWindowStart(w, new Date('2026-03-01T12:00:00Z'), 3600_000).toISOString()).toBe('2026-03-02T07:00:00.000Z')
    expect(nextWindowStart(w, new Date('2026-10-30T12:00:00Z'), 3600_000).toISOString()).toBe('2026-10-31T06:00:00.000Z')
    expect(nextWindowStart(w, new Date('2026-10-31T12:00:00Z'), 3600_000).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(nextWindowStart(w, new Date('2026-11-01T12:00:00Z'), 3600_000).toISOString()).toBe('2026-11-02T07:00:00.000Z')
  })

  it('keeps a weekly day in the zone, not in UTC', () => {
    // Sunday 23:30 in Sydney is Sunday 12:30 UTC (AEDT, +11); Monday in Sydney is still Sunday in UTC.
    const w = { day: 0, startMinute: 23 * 60 + 30, endMinute: 60, timeZone: 'Australia/Sydney' }
    expect(nextWindowStart(w, new Date('2026-10-14T00:00:00Z'), 3600_000).toISOString()).toBe('2026-10-18T12:30:00.000Z')
  })

  it('reads a time the clocks repeat as its first', () => {
    expect(instantOf('America/New_York', 2026, 11, 1, 90).toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('is written with its zone', () => {
    expect(windowText({ day: 0, startMinute: 120, endMinute: 240, timeZone: 'Europe/Paris' })).toBe('Sunday 02:00–04:00 (Europe/Paris)')
  })
})

describe('upgrades.set from Cloud @SC-1064', () => {
  it('sets fixes and the window with its zone, and answers what is held', async () => {
    const r = await ask({ op: 'upgrades.set', auto: true, window: window() })
    expect(r).toEqual({ ok: true, op: 'upgrades.set', result: { auto: true, window: window() } })
    expect(readUpgrades(m.ctx.state).window).toEqual(window())
  })

  it('moves the fixes the window scheduled, and cancels them when fixes go off', async () => {
    await upgradesTick(m.ctx)
    const before = listScheduled(m.ctx)[0].at
    await ask({ op: 'upgrades.set', auto: true, window: window({ startMinute: 23 * 60 }) })
    const moved = listScheduled(m.ctx)
    expect(moved).toHaveLength(1)
    expect(moved[0].at).not.toBe(before)
    expect(new Date(moved[0].at).getTime()).toBe(nextWindowStart(window({ startMinute: 23 * 60 }), m.ctx.now(), 3600_000).getTime())
    expect(await ask({ op: 'upgrades.set', auto: false, window: window() })).toMatchObject({ ok: true, result: { auto: false } })
    expect(listScheduled(m.ctx)).toEqual([])
  })

  it('refuses what it cannot read, changing nothing', async () => {
    const before = readUpgrades(m.ctx.state).window
    for (const bad of [
      { auto: true, window: window({ timeZone: 'Mars/Olympus' }) },
      { auto: true, window: window({ timeZone: undefined }) },
      { auto: true, window: window({ startMinute: 1440 }) },
      { auto: true, window: window({ endMinute: 120 }) },
      { auto: true, window: window({ day: 7 }) },
      { auto: true, window: window({ startMinute: 1.5 }) },
      { auto: 'yes', window: window() },
      { auto: true },
    ]) {
      expect(await ask({ op: 'upgrades.set', ...bad })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    }
    expect(readUpgrades(m.ctx.state).window).toEqual(before)
  })
})
