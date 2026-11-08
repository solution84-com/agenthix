import { describe, it, expect, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
vi.mock('../scheduledStart', () => ({
  startSchedulesDue: vi.fn(async () => { calls.push('schedules'); return 0 }),
}))

vi.mock('../routineFiring', () => ({
  fireRoutinesDue: vi.fn(async () => { calls.push('routines'); return 0 }),
}))

vi.mock('../routineRunStatus', () => ({}))

import { msToNextMinute, tick } from '../scheduler'

describe('the scheduler', () => {
  it('ticks at the top of the minute', () => {
    expect(msToNextMinute(new Date('2026-10-03T10:00:45.250Z'))).toBe(14_750)
    expect(msToNextMinute(new Date('2026-10-03T10:00:00.000Z'))).toBe(60_000)
  })

  it('fires the routines that are due and starts the start times that are due, and nothing else (adr-0175, adr-0177)', async () => {
    await tick(new Date())
    expect(calls).toEqual(['routines', 'schedules'])
  })
})
