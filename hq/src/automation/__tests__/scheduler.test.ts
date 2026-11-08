import { describe, it, expect, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
vi.mock('../scheduledStart', () => ({
  startSchedulesDue: vi.fn(async () => { calls.push('schedules'); return 0 }),
}))

vi.mock('../routineRounds', () => ({
  createRoundsDue: vi.fn(async () => { calls.push('routines'); return 0 }),
}))

vi.mock('../routineFailing', () => ({
  checkFailingRoutines: vi.fn(async () => { calls.push('failing'); return 0 }),
}))

import { msToNextMinute, tick } from '../scheduler'

describe('the scheduler', () => {
  it('ticks at the top of the minute', () => {
    expect(msToNextMinute(new Date('2026-10-03T10:00:45.250Z'))).toBe(14_750)
    expect(msToNextMinute(new Date('2026-10-03T10:00:00.000Z'))).toBe(60_000)
  })

  it('moves routines on before start times, so a round due now starts in the same tick (adr-0104); looks for failing routines last; fires no pulse (adr-0175)', async () => {
    await tick(new Date())
    expect(calls).toEqual(['routines', 'schedules', 'failing'])
  })
})
