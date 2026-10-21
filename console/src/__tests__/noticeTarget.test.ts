import { describe, expect, it } from 'vitest'
import { noticeTarget, wordAt, type NoticeFleet } from '../http/routes/noticeTarget'
import type { Move } from '../move/types'
import type { PinnedHost } from '../state/hosts'

// Each notice opens the thing it is about (the Fleet Console's notices panel): a machine's page, HQ's, a move under
// way, the fleet admins — or the dashboard when nothing it names is still here.

const fp = (c: string) => c.repeat(64)
const pinned = (machineName: string, c: string, over: Partial<PinnedHost> = {}): PinnedHost => ({
  fingerprint: fp(c), hostId: `h-${machineName}`, identity: {} as PinnedHost['identity'], machineName, siteName: machineName,
  executionSiteId: `es-${machineName}`, connectedAt: '2026-10-15T00:00:00.000Z', connectedBy: null, ...over,
})

const hqBox = pinned('machine-d', 'd', { hqMachine: true })
const office = pinned('office-server', 'a', { siteName: 'office' })
const lab = pinned('lab-01', 'b')
const lab2 = pinned('lab-02', 'c', { siteName: '' })

const ACTIVE = new Set(['waitingForMachine', 'arranging', 'scheduled', 'running', 'finishing'])
const fleet = (moves: Move[] = []): NoticeFleet => ({
  hosts: [hqBox, office, lab, lab2],
  moveOf: f => moves.find(m => ACTIVE.has(m.state) && (m.from === f || m.to === f)) ?? null,
  lastMoveOf: f => moves.findLast(m => m.from === f || m.to === f) ?? null,
})
const activity = (title: string, body = '') => ({ kind: 'activity' as const, title, body, hostId: null })
const moving = (from: PinnedHost, to: PinnedHost | null, kind?: 'hq', state: Move['state'] = 'running', moveId = 'm1') =>
  ({ moveId, from: from.fingerprint, to: to?.fingerprint ?? null, kind, state } as Move)

describe('what a notice opens @SC-884', () => {
  it('a machine’s notice: its page, HQ’s page for HQ’s machine, the dashboard once it is gone', () => {
    expect(noticeTarget({ kind: 'machineNotHeardFrom', title: 't', body: '', hostId: office.hostId }, fleet())).toEqual({ page: 'site', fingerprint: office.fingerprint })
    expect(noticeTarget({ kind: 'machineNotHeardFrom', title: 't', body: '', hostId: hqBox.hostId }, fleet())).toEqual({ page: 'hq', fingerprint: hqBox.fingerprint })
    expect(noticeTarget({ kind: 'machineLeft', title: 't', body: '', hostId: 'h-gone' }, fleet())).toEqual({ page: 'dashboard' })
  })

  it('the role given or removed: the fleet admins', () => {
    expect(noticeTarget({ kind: 'roleGranted', title: 'Sam made Ana a fleet admin', body: '', hostId: null }, fleet())).toEqual({ page: 'fleetAdmins' })
    expect(noticeTarget({ kind: 'roleRemoved', title: 'Sam removed Ana as a fleet admin', body: '', hostId: null }, fleet())).toEqual({ page: 'fleetAdmins' })
  })

  it('an action on a site: that site’s page, found by its machine in the words', () => {
    expect(noticeTarget(activity('Sam added the site office', 'office on office-server (ab12 cd34)'), fleet())).toEqual({ page: 'site', fingerprint: office.fingerprint })
    expect(noticeTarget(activity('Sam exported a backup of lab-01', 'lab-01'), fleet())).toEqual({ page: 'site', fingerprint: lab.fingerprint })
    expect(noticeTarget(activity('Sam connected the site lab-01 to HQ', 'lab-01'), fleet())).toEqual({ page: 'site', fingerprint: lab.fingerprint })
  })

  it('never takes one machine’s name inside another’s', () => {
    expect(wordAt('lab-01', 'lab')).toBe(-1)
    expect(wordAt('on lab-01.', 'lab-01')).toBe(3)
    expect(noticeTarget(activity('Sam took a backup of lab-02', 'lab-02'), fleet())).toEqual({ page: 'site', fingerprint: lab2.fingerprint })
  })

  it('an action on HQ: HQ’s page', () => {
    expect(noticeTarget(activity('office moved to lab-02'), fleet())).toEqual({ page: 'site', fingerprint: lab2.fingerprint })
    expect(noticeTarget(activity('HQ moved to machine-d', 'HQ now runs on machine-d'), fleet())).toEqual({ page: 'hq', fingerprint: hqBox.fingerprint })
    expect(noticeTarget(activity('Sam marked the machine HQ runs on', 'machine-d (dd), which said it runs HQ'), fleet())).toEqual({ page: 'hq', fingerprint: hqBox.fingerprint })
    expect(noticeTarget(activity('Sam erased machine-d', 'machine-d'), fleet())).toEqual({ page: 'hq', fingerprint: hqBox.fingerprint })
  })

  it('a move under way: its progress, on the page of the machine it leaves', () => {
    const move = moving(office, lab2)
    expect(noticeTarget(activity('Sam is moving office to lab-02', 'office from office-server to lab-02, now'), fleet([move])))
      .toEqual({ page: 'move', fingerprint: office.fingerprint, moveId: 'm1', hq: false })
    expect(noticeTarget(activity('Sam confirmed lab-02 to receive office', 'lab-02 joined to receive office (cc)'), fleet([move])))
      .toEqual({ page: 'move', fingerprint: office.fingerprint, moveId: 'm1', hq: false })
    expect(noticeTarget(activity('Sam is moving HQ to lab-02', 'HQ from machine-d to lab-02, now'), fleet([moving(hqBox, lab2, 'hq')])))
      .toEqual({ page: 'move', fingerprint: hqBox.fingerprint, moveId: 'm1', hq: true })
  })

  it('a finished move: its outcome, never Plan maintenance; the site’s page once the outcome is no longer held', () => {
    const done = moving(office, lab2, undefined, 'done', 'm2')
    // Named on the new machine, where the site runs now.
    expect(noticeTarget(activity('office moved to lab-02', 'office now runs on lab-02, and is named lab-02'), fleet([done])))
      .toEqual({ page: 'move', fingerprint: lab2.fingerprint, moveId: 'm2', hq: false })
    // A notice read while it went, opened once it is over: the same move's outcome.
    expect(noticeTarget(activity('Sam is moving office to lab-02', 'office from office-server to lab-02, now'), fleet([done])))
      .toEqual({ page: 'move', fingerprint: lab2.fingerprint, moveId: 'm2', hq: false })
    const failed = moving(office, lab2, undefined, 'failed', 'm3')
    expect(noticeTarget(activity('Moving office-server did not complete', 'the new machine did not take over'), fleet([failed])))
      .toEqual({ page: 'move', fingerprint: office.fingerprint, moveId: 'm3', hq: false })
    expect(noticeTarget(activity('HQ moved to lab-02', 'HQ now runs on lab-02'), fleet([moving(hqBox, lab2, 'hq', 'done', 'm4')])))
      .toEqual({ page: 'move', fingerprint: lab2.fingerprint, moveId: 'm4', hq: true })
    // No longer held: the site's own page.
    expect(noticeTarget(activity('Sam scheduled moving office to lab-02', 'office from office-server to lab-02, at 2026-10-17T02:00:00.000Z'), fleet()))
      .toEqual({ page: 'site', fingerprint: office.fingerprint })
    // Moving the Fleet Console is not a site's move.
    expect(noticeTarget(activity('Sam moved the Fleet Console to another machine', 'lab-02'), fleet([done])))
      .toEqual({ page: 'site', fingerprint: lab2.fingerprint })
  })

  it('an action on a machine no longer here: the dashboard', () => {
    expect(noticeTarget(activity('Sam disconnected the site old', 'old on old-box (ee)'), fleet())).toEqual({ page: 'dashboard' })
    expect(noticeTarget(activity('Sam changed something in the fleet', ''), fleet())).toEqual({ page: 'dashboard' })
  })
})
