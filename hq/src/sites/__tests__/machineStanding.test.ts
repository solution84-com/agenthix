import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: {} }))
import type { FleetHost } from '../../fleet/hosts'
import { leftAtOf } from '../../fleet/hosts'
import { leftNotice, machineStanding, notHeardFromNotice, NOT_HEARD_FROM_AFTER_MS } from '../machineStanding'

const at = (iso: string) => new Date(iso)
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  hostId: 'h1', fingerprint: 'f', machineName: 'machine-b', joinedAt: at('2026-10-14T08:00:00Z'),
  lastSeenAt: at('2026-10-14T21:40:00Z'), site: { id: 's1' }, leftAt: null, hqMachine: false, notifyIfSilent: true, stoppedAt: null, ...over,
})
const hqStarted = at('2026-10-14T06:00:00Z')
const minutes = (n: number) => new Date(at('2026-10-14T21:40:00Z').getTime() + n * 60_000)

describe('a machine not heard from (spec §10) @SC-929', () => {
  it('is fine while its host link is up', () => {
    expect(machineStanding(host(), true, minutes(60), hqStarted)).toEqual({ kind: 'fine' })
  })

  it('is not judged for the first 10 minutes after it was last heard from', () => {
    expect(machineStanding(host(), false, minutes(9), hqStarted)).toEqual({ kind: 'undecided' })
    expect(NOT_HEARD_FROM_AFTER_MS).toBe(10 * 60_000)
  })

  it('asks for a fleet admin after 10 minutes, since it was last heard from, whether or not work waits on it', () => {
    expect(machineStanding(host(), false, minutes(10), hqStarted)).toEqual({ kind: 'notHeardFrom', since: at('2026-10-14T21:40:00Z') })
  })

  it('counts from when it joined if it was never heard from', () => {
    expect(machineStanding(host({ lastSeenAt: null }), false, at('2026-10-14T08:10:00Z'), hqStarted))
      .toEqual({ kind: 'notHeardFrom', since: at('2026-10-14T08:00:00Z') })
  })

  it('gives every machine 10 minutes after HQ itself started, to connect again', () => {
    const started = minutes(30)
    expect(machineStanding(host(), false, minutes(35), started)).toEqual({ kind: 'undecided' })
    expect(machineStanding(host(), false, minutes(40), started)).toMatchObject({ kind: 'notHeardFrom' })
  })

  it('raises nothing, and clears an open notice, for a machine whose fleet admins did not ask, or one stopped on purpose', () => {
    expect(machineStanding(host({ notifyIfSilent: false }), false, minutes(60), hqStarted)).toEqual({ kind: 'fine' })
    expect(machineStanding(host({ stoppedAt: minutes(-1) }), false, minutes(60), hqStarted)).toEqual({ kind: 'fine' })
    // It left by itself all the same.
    expect(machineStanding(host({ notifyIfSilent: false, leftAt: minutes(1) }), false, minutes(60), hqStarted)).toMatchObject({ kind: 'left' })
  })

  it('always asks about hq’s own machine', () => {
    expect(machineStanding(host({ hqMachine: true, notifyIfSilent: false }), false, minutes(10), hqStarted)).toMatchObject({ kind: 'notHeardFrom' })
  })

  it('says when, in the reader’s own zone, with what may be wrong and what to do', () => {
    const n = notHeardFromNotice(host(), at('2026-10-14T21:40:00Z'), at('2026-10-14T21:55:00Z'), 'UTC', '/admin/where-work-runs/s1')
    expect(n).toMatchObject({
      type: 'fleet_machine_not_heard_from', subjectKey: 'h1',
      title: 'Not heard from machine-b since 21:40',
      body: 'It may be switched off, disconnected on the machine, or unable to reach HQ.',
      actionLabel: 'Open in the Fleet Console', actionUrl: '/admin/where-work-runs/s1',
    })
    expect(notHeardFromNotice(host(), at('2026-10-14T21:40:00Z'), at('2026-10-14T21:55:00Z'), 'Australia/Sydney', '/x').title)
      .toBe('Not heard from machine-b since 08:40')
    expect(notHeardFromNotice(host(), at('2026-10-14T21:40:00Z'), at('2026-10-16T09:00:00Z'), 'UTC', '/x').title)
      .toBe('Not heard from machine-b since Wed 14 Oct at 21:40')
  })
})

describe('a machine that left by itself (spec §6) @SC-930', () => {
  it('stands as left, not as not heard from, until a fleet admin removes it', () => {
    const left = host({ leftAt: at('2026-10-14T21:41:00Z') })
    expect(machineStanding(left, false, minutes(600), hqStarted)).toEqual({ kind: 'left', at: at('2026-10-14T21:41:00Z') })
  })

  it('asks fleet admins to remove it in the Fleet Console', () => {
    expect(leftNotice(host(), '/admin/where-work-runs/s1')).toMatchObject({
      type: 'fleet_machine_left', subjectKey: 'h1', title: 'machine-b left the fleet', body: 'Disconnected on the machine itself.',
      actionLabel: 'Remove it in the Fleet Console',
    })
  })

  it('is read from its last site: one that left by itself since the machine joined', () => {
    const joined = at('2026-10-14T08:00:00Z')
    const site = (over = {}) => ({ id: 's', status: 'REVOKED', leftByItself: true, revokedAt: at('2026-10-14T21:41:00Z'), ...over })
    expect(leftAtOf(joined, site())).toEqual(at('2026-10-14T21:41:00Z'))
    expect(leftAtOf(joined, site({ leftByItself: false }))).toBeNull()
    expect(leftAtOf(joined, site({ status: 'ONLINE', revokedAt: null }))).toBeNull()
    expect(leftAtOf(joined, undefined)).toBeNull()
    // It joined again with a new code since: the leaving is history.
    expect(leftAtOf(at('2026-10-14T22:00:00Z'), site())).toBeNull()
  })

  it('is read from the machine itself when it said it left with its machine credential, site or none', () => {
    const joined = at('2026-10-14T08:00:00Z')
    const own = at('2026-10-14T21:40:00Z')
    expect(leftAtOf(joined, undefined, own)).toEqual(own)
    expect(leftAtOf(joined, { id: 's', status: 'ONLINE', leftByItself: false, revokedAt: null }, own)).toEqual(own)
    // Both said so: the earlier counts.
    expect(leftAtOf(joined, { id: 's', status: 'REVOKED', leftByItself: true, revokedAt: at('2026-10-14T21:41:00Z') }, own)).toEqual(own)
    expect(leftAtOf(joined, undefined, null)).toBeNull()
    // It joined again since.
    expect(leftAtOf(at('2026-10-14T22:00:00Z'), undefined, own)).toBeNull()
  })
})
