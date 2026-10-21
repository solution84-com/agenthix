import { describe, expect, it } from 'vitest'
import type { ScheduledChange, ScheduledChangeNotice, ScheduledChangeUpdate } from '@agenthix/core'
import type { FleetHost } from '../pages/dashboard/types'
import { changeTitle, scheduledBy, changeLists, stateOf, upgradeSteps } from '../pages/maintenance/words'

const NOW = new Date('2030-10-15T12:00:00.000Z')
const iso = (days: number, hours = 0) => new Date(NOW.getTime() + days * 86400_000 + hours * 3600_000).toISOString()

const change = (over: Partial<ScheduledChange> = {}): ScheduledChange => ({
  id: 'c1', kind: 'upgrade', target: 'hq', siteName: 'acme', machine: { name: 'hq-box', fingerprint: 'a'.repeat(64) },
  at: iso(3), scheduledBy: { kind: 'fleetAdmin', userId: 'u1', name: 'Sam Rivera' }, scheduledAt: iso(-2),
  state: 'scheduled', detail: '0.3.0', expectedMinutes: 10, ...over,
})
const notice = (c: ScheduledChange, update: ScheduledChangeUpdate, sentAt: string, reason: string | null = null): ScheduledChangeNotice =>
  ({ update, change: c, sentAt, reason })
const host = (scheduled: ScheduledChangeNotice[], over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: 'a'.repeat(64), fingerprintShort: 'aaaa', hostId: 'h', machineName: 'hq-box', siteName: 'acme', hqMachine: true,
  siteRegistered: true, connectedAt: iso(-30), online: true, since: null, leftByItself: false, leftAt: null,
  figures: null, figuresAt: null, agents: null, scheduled, move: null, ...over,
})

describe('naming a scheduled change for what it does @SC-907', () => {
  it('says which thing each kind changes, and where', () => {
    expect(changeTitle(change())).toBe('Upgrade HQ to 0.3.0')
    expect(changeTitle(change({ target: 'site', machine: { name: 'hel-2', fingerprint: 'b'.repeat(64) } }))).toBe('Upgrade hel-2 to 0.3.0')
    expect(changeTitle(change({ kind: 'resize', target: 'site', detail: '4 → 6 runs at once' }))).toBe("Change hq-box's capacity: 4 → 6 runs at once")
    expect(changeTitle(change({ kind: 'erase', detail: null }))).toBe('Erase HQ')
    expect(changeTitle(change({ kind: 'erase', target: 'site', detail: null }))).toBe('Erase hq-box')
    expect(changeTitle(change({ kind: 'move', target: 'site', detail: 'to new-server' }))).toBe('Move hq-box to new-server')
    expect(changeTitle(change({ kind: 'restore', detail: null }))).toBe('Restore HQ from a backup')
    expect(changeTitle(change({ kind: 'suspend', detail: null }))).toBe('Suspend HQ')
  })
  it('names who scheduled it', () => {
    expect(scheduledBy({ kind: 'fleetAdmin', userId: 'u1', name: 'Sam Rivera' })).toBe('Sam Rivera')
    expect(scheduledBy({ kind: 'machineAdmin' })).toBe('its machine admin, on the machine')
    expect(scheduledBy({ kind: 'cloud' })).toBe('Cloud')
    expect(scheduledBy({ kind: 'maintenanceWindow' })).toBe('the maintenance window')
  })
})

describe('the list @SC-907', () => {
  it('takes each change at its newest notice, and orders what is coming by its time', () => {
    const later = change({ id: 'c2', at: iso(5) })
    const early = change({ id: 'c1', at: iso(3) })
    const moved = { ...early, at: iso(6) }
    const lists = changeLists([host([
      notice(later, 'scheduled', iso(-2)), notice(early, 'scheduled', iso(-2)), notice(moved, 'changed', iso(-1)),
    ])], NOW)
    expect(lists.planned.map(e => [e.change.id, e.change.at])).toEqual([['c2', iso(5)], ['c1', iso(6)]])
    expect(lists.done).toEqual([])
  })
  it('puts a cancelled, finished or rolled-back change under done, for the last 30 days', () => {
    const rolled = change({ id: 'r', state: 'rolledBack', at: iso(-1) })
    const done = change({ id: 'd', state: 'done', at: iso(-5) })
    const old = change({ id: 'o', state: 'done', at: iso(-40) })
    const cancelled = change({ id: 'x', state: 'cancelled', at: iso(2) })
    const lists = changeLists([host([
      notice(rolled, 'failed', iso(-1), 'the site did not come up healthy'), notice(done, 'completed', iso(-5)),
      notice(old, 'completed', iso(-40)), notice(cancelled, 'cancelled', iso(-1)),
    ])], NOW)
    expect(lists.planned).toEqual([])
    expect(lists.done.map(e => e.change.id)).toEqual(['x', 'r', 'd'])
  })
  it('does not let a late notice overwrite a newer one', () => {
    const c = change()
    const lists = changeLists([host([notice({ ...c, state: 'cancelled' }, 'cancelled', iso(-1)), notice(c, 'scheduled', iso(-2))])], NOW)
    expect(lists.planned).toEqual([])
  })
})

describe('the state of a change @SC-907', () => {
  it('says it in words', () => {
    const at = (state: ScheduledChange['state'], reason: string | null = null) =>
      stateOf({ change: change({ state }), notices: [], latest: notice(change({ state }), 'scheduled', iso(0), reason) })
    expect(at('running')).toEqual({ label: 'Under way', tone: 'warning', detail: null })
    expect(at('running', 'Waiting for the backup to finish; it starts as soon as that has, if within 30 minutes.').detail)
      .toBe('Waiting for the backup to finish; it starts as soon as that has, if within 30 minutes.')
    expect(at('pausing').label).toBe('Pausing runs')
    expect(at('done')).toEqual({ label: 'Done', tone: 'healthy', detail: null })
    expect(at('rolledBack', 'the site did not come up healthy')).toEqual({ label: 'Failed — rolled back', tone: 'danger', detail: 'the site did not come up healthy' })
    expect(at('missed').label).toBe('Not run')
    expect(at('cancelled').label).toBe('Cancelled')
  })
})

describe('an upgrade, step by step, as far as the notices say @SC-907', () => {
  it('follows the notices it has had, and leaves the rest waiting', () => {
    const c = change({ state: 'running' })
    const steps = upgradeSteps([notice(c, 'scheduled', iso(-2)), notice(c, 'pausing', iso(0, -1)), notice(c, 'started', iso(0))], c)
    expect(steps.map(s => [s.label, s.mark])).toEqual([
      ['Notice shown to members', 'done'], ['Runs paused', 'done'], ['Starting 0.3.0', 'now'], ['Health check', 'waiting'],
    ])
  })
  it('ends a failed upgrade on the failure, and says it went back', () => {
    const c = change({ state: 'rolledBack' })
    const steps = upgradeSteps([notice(c, 'scheduled', iso(-2)), notice(c, 'started', iso(-1)), notice(c, 'failed', iso(-1, 1), 'hq-server did not answer within 10 minutes')], c)
    expect(steps.map(s => [s.label, s.mark])).toEqual([
      ['Notice shown to members', 'done'], ['Starting 0.3.0', 'done'], ['Health check', 'failed'], ['Rolled back', 'done'],
    ])
    expect(steps[2].detail).toBe('hq-server did not answer within 10 minutes')
  })
  it('ends a completed upgrade on its health check passing', () => {
    const c = change({ state: 'done' })
    const steps = upgradeSteps([notice(c, 'scheduled', iso(-2)), notice(c, 'started', iso(-1)), notice(c, 'completed', iso(-1, 1))], c)
    expect(steps.at(-1)).toMatchObject({ label: 'Health check', mark: 'done' })
  })
})

describe('changes on two machines @SC-907', () => {
  it('keeps the same id on two machines as two changes', () => {
    const onA = change({ id: '1', at: iso(1) })
    const onB = change({ id: '1', at: iso(2), machine: { name: 'hel-2', fingerprint: 'b'.repeat(64) } })
    const lists = changeLists([
      host([notice(onA, 'scheduled', iso(-1))]),
      host([notice(onB, 'scheduled', iso(-1))], { fingerprint: 'b'.repeat(64), machineName: 'hel-2', hqMachine: false }),
    ], NOW)
    expect(lists.planned).toHaveLength(2)
  })
})
