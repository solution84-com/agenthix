/** A project's one series of sprints (spec D8, D13, N7): dates, the current sprint, overdue, a change of length. */
import { describe, it, expect } from 'vitest'
import {
  currentOf, daysLeft, daysOverdue, nextSpan, relaidUpcoming, seriesDays, seriesParts, spanFrom, sprintDays, sprintDaysProblem, sprintTitle,
} from '../sprintSeries'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const sprint = (number: number, start: string, finish: string, finishedAt: Date | null = null) =>
  ({ id: `s${number}`, number, startDate: day(start), finishDate: day(finish), finishedAt })

describe('a sprint\'s dates', () => {
  it('run from its first day to its last, both included', () => {
    expect(spanFrom(new Date('2026-11-03T15:00:00Z'), 14)).toEqual({ startDate: day('2026-11-03'), finishDate: day('2026-11-16') })
    expect(sprintDays({ startDate: day('2026-11-03'), finishDate: day('2026-11-16') })).toBe(14)
  })
  it('the next starts the day after the last one\'s last day, as long unless told otherwise', () => {
    const s4 = spanFrom(day('2026-11-03'), 14)
    expect(nextSpan(s4)).toEqual({ startDate: day('2026-11-17'), finishDate: day('2026-11-30') })
    expect(nextSpan(s4, 7)).toEqual({ startDate: day('2026-11-17'), finishDate: day('2026-11-23') })
  })
  it('a length is 1 to 366 whole days', () => {
    expect(sprintDaysProblem(14)).toBeNull()
    expect(sprintDaysProblem(0)).not.toBeNull()
    expect(sprintDaysProblem(1.5)).not.toBeNull()
    expect(sprintDaysProblem('14')).not.toBeNull()
    expect(sprintDaysProblem(367)).not.toBeNull()
  })
})

describe('the series', () => {
  const series = [
    sprint(1, '2026-10-06', '2026-10-19', day('2026-10-19')),
    sprint(3, '2026-11-03', '2026-11-16'),
    sprint(2, '2026-10-20', '2026-11-02', day('2026-11-02')),
    sprint(4, '2026-11-17', '2026-11-30'),
  ]
  it('the current sprint is the lowest-numbered one not finished', () => {
    expect(currentOf(series)?.number).toBe(3)
  })
  it('splits into current, upcoming in order, and past newest first', () => {
    const parts = seriesParts(series)
    expect(parts.current?.number).toBe(3)
    expect(parts.upcoming.map(s => s.number)).toEqual([4])
    expect(parts.past.map(s => s.number)).toEqual([2, 1])
  })
  it('is as long as its newest sprint, and has no length with no sprints', () => {
    expect(seriesDays(series)).toBe(14)
    expect(seriesDays([])).toBeNull()
  })
  it('a change of length re-lays the upcoming sprints after the current, which keeps its dates', () => {
    const relaid = relaidUpcoming(series[1], [sprint(5, '2026-12-01', '2026-12-14'), series[3]], 7)
    expect(relaid).toEqual([
      { id: 's4', startDate: day('2026-11-17'), finishDate: day('2026-11-23') },
      { id: 's5', startDate: day('2026-11-24'), finishDate: day('2026-11-30') },
    ])
  })
})

describe('days left and overdue (N7)', () => {
  const s = sprint(4, '2026-11-03', '2026-11-14')
  it('counts today as a day left, and none after the last day', () => {
    expect(daysLeft(s, new Date('2026-11-14T20:00:00Z'))).toBe(1)
    expect(daysLeft(s, day('2026-11-08'))).toBe(7)
    expect(daysLeft(s, day('2026-11-16'))).toBe(0)
  })
  it('a sprint past its last day stays current and is overdue by the days since', () => {
    expect(daysOverdue(s, day('2026-11-14'))).toBe(0)
    expect(daysOverdue(s, day('2026-11-16'))).toBe(2)
    expect(daysOverdue({ ...s, finishedAt: day('2026-11-15') }, day('2026-11-20'))).toBe(0)
  })
})

describe('a sprint\'s title', () => {
  it('keeps the number through a rename', () => {
    expect(sprintTitle({ number: 12, name: null })).toBe('Sprint 12')
    expect(sprintTitle({ number: 12, name: 'Pricing push' })).toBe('Sprint 12 · Pricing push')
  })
})
