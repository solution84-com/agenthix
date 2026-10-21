/** A sprint's dates (adr-0097): the first from its length, the next with the same length, the days left. */
import { describe, it, expect } from 'vitest'
import { firstSprintDates, nextSprintDates, sprintDaysLeft, sprintLabel, DEFAULT_SPRINT_DAYS } from '../sprintDates'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('firstSprintDates @SC-547', () => {
  it('starts on the day given and lasts the days given', () => {
    expect(firstSprintDates(new Date('2026-10-08T15:30:00Z'), 14)).toEqual({ startDate: day('2026-10-08'), finishDate: day('2026-10-22') })
  })
  it('lasts two weeks when no length is given', () => {
    expect(DEFAULT_SPRINT_DAYS).toBe(14)
  })
  it('refuses a length under one day or over a year', () => {
    expect(() => firstSprintDates(day('2026-10-08'), 0)).toThrow()
    expect(() => firstSprintDates(day('2026-10-08'), 400)).toThrow()
  })
})

describe('nextSprintDates @SC-548', () => {
  it('starts on the day the last one is finished, with the same length', () => {
    const prev = { startDate: day('2026-10-01'), finishDate: day('2026-10-15') }
    expect(nextSprintDates(prev, new Date('2026-10-14T10:00:00Z'))).toEqual({ startDate: day('2026-10-14'), finishDate: day('2026-10-28') })
  })
  it('keeps at least one day', () => {
    const prev = { startDate: day('2026-10-01'), finishDate: day('2026-10-01') }
    expect(nextSprintDates(prev, day('2026-10-03')).finishDate).toEqual(day('2026-10-04'))
  })
})

describe('sprintDaysLeft', () => {
  it('counts whole days to the finish, never below zero', () => {
    const s = { startDate: day('2026-10-01'), finishDate: day('2026-10-15') }
    expect(sprintDaysLeft(s, new Date('2026-10-08T12:00:00Z'))).toBe(7)
    expect(sprintDaysLeft(s, day('2026-10-20'))).toBe(0)
  })
})

describe('sprintLabel @SC-550', () => {
  it('names it by number, and keeps the number beside a name', () => {
    expect(sprintLabel({ number: 12, name: null })).toBe('Sprint 12')
    expect(sprintLabel({ number: 12, name: 'Pricing push' })).toBe('Sprint 12 · Pricing push')
  })
})
