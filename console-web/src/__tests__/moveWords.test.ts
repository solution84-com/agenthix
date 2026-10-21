import { describe, expect, it } from 'vitest'
import { moveProgress, type Move } from '../pages/site/move/moveWords'

const NOW = new Date('2026-10-15T10:00:00')
const NAMES = { from: 'office-server', to: 'new-server' }

const move = (over: Partial<Move> = {}): Move => ({
  moveId: 'm1', from: 'a'.repeat(64), siteName: 'office', executionSiteId: 's1', joinId: 'j1', to: 'b'.repeat(64),
  transferId: 't1', at: null, by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: { userId: 'u1', name: 'Sam Rivera' },
  changeId: null, state: 'running', reports: { from: null, to: null }, problem: null, createdAt: '2026-10-15T09:00:00', ...over,
})

const states = (m: Move) => moveProgress(m, NAMES, NOW).steps.map(s => s.state)

describe('a move, in its phases @SC-912', () => {
  it('waiting for the new machine: the first step, which can still be cancelled', () => {
    const p = moveProgress(move({ state: 'waitingForMachine', to: null, transferId: null, confirmedBy: null }), { from: 'office-server', to: null }, NOW)
    expect(p.title).toBe('Moving office to a new machine')
    expect(p.stepOf).toBe('Step 1 of 5')
    expect(p.steps.map(s => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo'])
    expect(p.canCancel).toBe(true)
    expect(p.ended).toBeNull()
  })

  it('scheduled: the new machine confirmed, the time it runs, and still cancellable', () => {
    const p = moveProgress(move({ state: 'scheduled', at: '2026-10-18T22:00:00' }), NAMES, NOW)
    expect(p.steps[0]).toMatchObject({ state: 'done', label: 'new-server connected and waiting' })
    expect(p.steps[0].detail).toContain('fingerprint confirmed by Sam Rivera')
    expect(p.steps[1]).toMatchObject({ state: 'current', detail: 'Scheduled for 18 Oct 22:00.' })
    expect(p.canCancel).toBe(true)
  })

  it('running: each step only on what the machines said', () => {
    expect(states(move({ state: 'running' }))).toEqual(['done', 'current', 'todo', 'todo', 'todo'])
    expect(states(move({ reports: { from: 'started', to: null } }))).toEqual(['done', 'current', 'todo', 'todo', 'todo'])
    expect(states(move({ reports: { from: 'transferring', to: null } }))).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(states(move({ reports: { from: 'transferring', to: 'restoring' } }))).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(moveProgress(move(), NAMES, NOW).canCancel).toBe(false)
  })

  it('the new machine took over: the old copy goes last', () => {
    const p = moveProgress(move({ state: 'finishing', reports: { from: 'committed', to: 'tookOver' } }), NAMES, NOW)
    expect(p.steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'done', 'current'])
    expect(p.stepOf).toBe('Step 5 of 5')
    expect(p.canFinish).toBe(false)
  })

  it('the tidying stalled: the Fleet Console says why, and it can be carried on', () => {
    const p = moveProgress(move({ state: 'finishing', reports: { from: 'committed', to: 'tookOver' }, problem: 'The site runs on new-server, but the old copy is not removed yet: no answer.' }), NAMES, NOW)
    expect(p.canFinish).toBe(true)
    expect(p.problem).toBe('The site runs on new-server, but the old copy is not removed yet: no answer.')
  })

  it('done: ends there, in words', () => {
    const p = moveProgress(move({ state: 'done', reports: { from: 'removed', to: 'tookOver' } }), NAMES, NOW)
    expect(p.steps.every(s => s.state === 'done')).toBe(true)
    expect(p.stepOf).toBeNull()
    expect(p.ended).toEqual({ tone: 'healthy', title: 'Moved.', text: 'office now runs on new-server, and is named new-server. office-server has left the fleet.' })
  })

  it("failed: the step it stopped at, and the Fleet Console's own sentence of where the site runs", () => {
    const problem = 'The backup did not arrive. The site office runs on office-server again.'
    const p = moveProgress(move({ state: 'failed', reports: { from: 'rolledBack', to: 'failed' }, problem }), NAMES, NOW)
    expect(p.ended).toEqual({ tone: 'danger', title: 'The move did not complete.', text: problem })
    expect(p.steps.filter(s => s.state === 'failed')).toHaveLength(1)
    expect(p.canCancel).toBe(false)
  })

  it('cancelled', () => {
    const p = moveProgress(move({ state: 'cancelled', to: null }), { from: 'office-server', to: null }, NOW)
    expect(p.ended).toEqual({ tone: 'neutral', title: 'Cancelled.', text: 'office stays on office-server.' })
  })
})
