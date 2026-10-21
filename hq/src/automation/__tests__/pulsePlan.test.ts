import { describe, it, expect } from 'vitest'
import { dueBy, pulseDueAt, roundFinished, selectBatches } from '../pulsePlan'

const at = (hhmm: string) => new Date(`2026-10-03T${hhmm}:00Z`)

describe('the throttle fires on the leading edge, measured from when a round finishes', () => {
  it('a boundary that never had a round is due now', () => {
    expect(pulseDueAt(null, 30, at('10:00'))).toEqual(at('10:00'))
  })

  it('a round that finished long ago leaves the pulse already due, so a newly queued task starts at once', () => {
    expect(pulseDueAt(at('07:00'), 30, at('10:00')).getTime()).toBeLessThan(at('10:00').getTime())
  })

  it('the next pulse is the interval after the round finished, however long the round took', () => {
    // A round that started 09:30 and finished 10:10 → no earlier than 10:40.
    expect(pulseDueAt(at('10:10'), 30, at('10:15'))).toEqual(at('10:40'))
  })
})

describe('a round finishes when none of the tasks it let through is still queued or running', () => {
  it('is open while one is running or still in its agent\'s line', () => {
    expect(roundFinished(['RUN_NONE', 'RUN_ACTIVE'])).toBe(false)
    expect(roundFinished(['RUN_NONE', 'RUN_QUEUED'])).toBe(false)
  })

  it('is finished once each has finished, failed, blocked, been stopped or withdrawn', () => {
    expect(roundFinished(['RUN_NONE', 'RUN_FAILED', 'RUN_BLOCKED'])).toBe(true)
  })

  it('a round with no tasks left (all deleted) is finished', () => {
    expect(roundFinished([])).toBe(true)
  })
})

describe('a batch per agent', () => {
  const t = (id: string, agent: string | null, priority: string, minute: number) => ({
    id, assignedAgentId: agent, priority, createdAt: new Date(2026, 9, 3, 9, minute),
  })

  it('gives each agent up to the batch size of its own tasks, highest priority first, then longest queued', () => {
    const tasks = [
      t('x-low', 'X', 'LOW', 0), t('x-high-new', 'X', 'HIGH', 5), t('x-high-old', 'X', 'HIGH', 1),
      t('x-med', 'X', 'MEDIUM', 2), t('y-1', 'Y', 'MEDIUM', 3),
    ]
    const batches = selectBatches(tasks, 3)
    expect(batches.get('X')!.map(b => b.id)).toEqual(['x-high-old', 'x-high-new', 'x-med'])
    expect(batches.get('Y')!.map(b => b.id)).toEqual(['y-1'])
  })

  it('agents do not compete for priority: a low-priority agent still gets its batch', () => {
    const tasks = [t('x1', 'X', 'HIGH', 0), t('x2', 'X', 'HIGH', 1), t('y1', 'Y', 'LOW', 2)]
    expect(selectBatches(tasks, 1).get('Y')!.map(b => b.id)).toEqual(['y1'])
  })

  it('the spec example: 6 for X and 4 for Y with a batch of 3 starts 3 each and leaves 4', () => {
    const tasks = [
      ...Array.from({ length: 6 }, (_, i) => t(`x${i}`, 'X', 'MEDIUM', i)),
      ...Array.from({ length: 4 }, (_, i) => t(`y${i}`, 'Y', 'MEDIUM', i)),
    ]
    const batches = selectBatches(tasks, 3)
    expect(batches.get('X')!.length + batches.get('Y')!.length).toBe(6)
  })

  it('skips a task with no agent', () => {
    expect(selectBatches([t('n', null, 'HIGH', 0)], 3).size).toBe(0)
  })
})

describe('finding 3 — a tick counts what falls due within its own minute', () => {
  const due = (iso: string, tick: string) => new Date(iso) <= dueBy(new Date(tick))

  it('a pulse due at 2:40:00.001 fires on the 2:40:00.000 tick, not the 2:41 one', () => {
    expect(due('2026-10-03T02:40:00.001Z', '2026-10-03T02:40:00.000Z')).toBe(true)
  })

  it('so does one due late in the same minute, and the tick landing a few milliseconds late', () => {
    expect(due('2026-10-03T02:40:59.000Z', '2026-10-03T02:40:00.004Z')).toBe(true)
  })

  it('a timer firing a moment early still counts as its own minute', () => {
    expect(due('2026-10-03T02:40:00.000Z', '2026-10-03T02:39:59.999Z')).toBe(true)
  })

  it('nothing due in the next minute fires early', () => {
    expect(due('2026-10-03T02:41:00.000Z', '2026-10-03T02:40:00.000Z')).toBe(false)
  })

  it('an interval measured from a round closed a few milliseconds into a tick is due on its minute, not a minute later', () => {
    expect(pulseDueAt(new Date('2026-10-03T02:10:00.003Z'), 30, new Date())).toEqual(new Date('2026-10-03T02:40:00Z'))
  })

  it('an interval measured from mid-minute is rounded up, never shortened', () => {
    expect(pulseDueAt(new Date('2026-10-03T02:09:37Z'), 30, new Date())).toEqual(new Date('2026-10-03T02:40:00Z'))
  })
})
