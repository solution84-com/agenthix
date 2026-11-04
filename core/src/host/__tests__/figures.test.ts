import { describe, expect, it } from 'vitest'
import { narrowCeilings, parseEffectiveCeilings, parseHostCeilings, type HostCeilings } from '../figures.js'
import { parseScheduledChangeNotice, type ScheduledChangeNotice } from '../scheduledChange.js'

const machine: HostCeilings = { memoryBytesPerContainer: 8e9, cpusPerContainer: 2, processesPerContainer: 1024, containersAtOnce: 6 }

describe('ceilings', () => {
  it('narrow to the smallest, and never rise', () => {
    expect(narrowCeilings(machine, { memoryBytesPerContainer: 4e9 }, { cpusPerContainer: 1, memoryBytesPerContainer: 6e9 })).toEqual({
      ...machine, memoryBytesPerContainer: 4e9, cpusPerContainer: 1,
    })
    expect(narrowCeilings(machine, { containersAtOnce: 60, processesPerContainer: 0 }, null, { cpusPerContainer: Number.NaN })).toEqual(machine)
  })

  it('are read off the wire only when every value is a positive number', () => {
    expect(parseHostCeilings(machine)).toEqual(machine)
    expect(parseHostCeilings({ ...machine, containersAtOnce: 1.5 })).toBeNull()
    expect(parseHostCeilings({ ...machine, cpusPerContainer: -1 })).toBeNull()
    expect(parseEffectiveCeilings({ ceilings: narrowCeilings(machine, { containersAtOnce: 2 }), machine })).not.toBeNull()
    expect(parseEffectiveCeilings({ ceilings: { ...machine, containersAtOnce: 7 }, machine })).toBeNull()
  })
})

describe('the scheduled-change notice', () => {
  const notice: ScheduledChangeNotice = {
    update: 'scheduled',
    change: {
      id: 'c1', kind: 'upgrade', target: 'site', siteName: 'office-server',
      machine: { name: 'new-server', fingerprint: 'a'.repeat(64) }, at: '2026-10-15T02:00:00.000Z',
      scheduledBy: { kind: 'fleetAdmin', userId: 'u1', name: 'Sam' }, scheduledAt: '2026-10-14T09:00:00.000Z',
      state: 'scheduled', detail: '0.2.1', expectedMinutes: 20,
    },
    sentAt: '2026-10-14T09:00:00.000Z',
    reason: null,
  }

  it('keeps a well-formed notice as it is', () => {
    expect(parseScheduledChangeNotice(JSON.parse(JSON.stringify(notice)))).toEqual(notice)
    const byMachine = { ...notice, change: { ...notice.change, scheduledBy: { kind: 'machineAdmin', userId: 'x' } } }
    expect(parseScheduledChangeNotice(byMachine)?.change.scheduledBy).toEqual({ kind: 'machineAdmin' })
    const byWindow = { ...notice, change: { ...notice.change, scheduledBy: { kind: 'maintenanceWindow' } } }
    expect(parseScheduledChangeNotice(byWindow)?.change.scheduledBy).toEqual({ kind: 'maintenanceWindow' })
  })

  it('refuses what is not a notice', () => {
    expect(parseScheduledChangeNotice(null)).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, update: 'booked' })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, kind: 'shell' } })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, at: 'soon' } })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, scheduledBy: { kind: 'fleetAdmin' } } })).toBeNull()
  })

  it('refuses an identifier that is too long instead of cutting it, and bounds and normalises times', () => {
    const long = 'x'.repeat(301)
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, id: long } })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, machine: { name: 'm', fingerprint: long } } })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, scheduledBy: { kind: 'fleetAdmin', userId: long, name: 'Sam' } } })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, sentAt: `2026-10-14T09:00:00.000Z${' '.repeat(100)}` })).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, sentAt: '2026-10-14T11:00:00+02:00' })?.sentAt).toBe('2026-10-14T09:00:00.000Z')
    // A long name or reason is still shortened: only an identifier is refused.
    expect(parseScheduledChangeNotice({ ...notice, reason: long })?.reason).toHaveLength(300)
  })

  it('reads a missed change, and drops an expected length that is not a sensible number of minutes', () => {
    const missed = { ...notice, update: 'missed', change: { ...notice.change, state: 'missed' }, reason: 'It was not run.' }
    expect(parseScheduledChangeNotice(missed)?.update).toBe('missed')
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, expectedMinutes: -3 } })?.change.expectedMinutes).toBeNull()
    expect(parseScheduledChangeNotice({ ...notice, change: { ...notice.change, expectedMinutes: 1e9 } })?.change.expectedMinutes).toBeNull()
  })
})
