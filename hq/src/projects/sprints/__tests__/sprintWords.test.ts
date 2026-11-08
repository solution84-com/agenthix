/** The Sprints screen's words (spec D13, N7): dates, how the current sprint stands, the series and a past sprint. */
import { describe, expect, it } from 'vitest'
import { atWorkText, barParts, lengthText, nextMondayValue, pastLine, plannedText, seriesLine, sprintSpanText, sprintTimeText } from '../sprintWords'

const day = (s: string) => new Date(`${s}T00:00:00Z`)
const NOW = day('2026-11-07')
const counts = (c: Partial<Record<'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE', number>>) => {
  const all = { BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, DONE: 0, ...c }
  return { ...all, total: all.BACKLOG + all.TODO + all.IN_PROGRESS + all.DONE }
}

describe('a sprint\'s dates', () => {
  it('writes the month once inside one month, and both across two', () => {
    expect(sprintSpanText(day('2026-11-03'), day('2026-11-14'), NOW)).toBe('3–14 Nov')
    expect(sprintSpanText(day('2026-09-22'), day('2026-10-03'), NOW)).toBe('22 Sep–3 Oct')
  })

  it('says the year only when it is not this one', () => {
    expect(sprintSpanText(day('2027-01-04'), day('2027-01-15'), NOW)).toBe('4–15 Jan 2027')
    expect(sprintSpanText(day('2026-12-28'), day('2027-01-08'), NOW)).toBe('28 Dec 2026–8 Jan 2027')
  })
})

describe('how the current sprint stands', () => {
  it('counts the days left, today included, and says the last day', () => {
    expect(sprintTimeText({ startDate: day('2026-11-03'), daysLeft: 7, daysOverdue: 0 }, NOW)).toBe('7 days left')
    expect(sprintTimeText({ startDate: day('2026-11-03'), daysLeft: 1, daysOverdue: 0 }, NOW)).toBe('last day')
  })

  it('stays current after its last day and says how long ago it ended (N7)', () => {
    expect(sprintTimeText({ startDate: day('2026-10-20'), daysLeft: 0, daysOverdue: 2 }, NOW)).toBe('ended 2 days ago')
    expect(sprintTimeText({ startDate: day('2026-10-20'), daysLeft: 0, daysOverdue: 1 }, NOW)).toBe('ended yesterday')
  })

  it('says when one not begun yet starts', () => {
    expect(sprintTimeText({ startDate: day('2026-11-10'), daysLeft: 18, daysOverdue: 0 }, NOW)).toBe('starts in 3 days')
  })
})

describe('the series', () => {
  it('says its length in weeks, and the weekday it starts on', () => {
    expect(lengthText(14)).toBe('2 weeks')
    expect(lengthText(7)).toBe('1 week')
    expect(lengthText(10)).toBe('10 days')
    expect(seriesLine(14, day('2026-11-02'))).toBe('One series for the project: 2 weeks each, from Monday.')
    expect(seriesLine(14, day('2026-11-02'), true)).toBe('One series: 2 weeks each, from Monday.')
    expect(seriesLine(10, day('2026-11-02'))).toBe('One series for the project: 10 days each.')
  })

  it('suggests the next Monday for the first sprint', () => {
    expect(nextMondayValue(new Date(2026, 10, 7))).toBe('2026-11-09')
    expect(nextMondayValue(new Date(2026, 10, 9))).toBe('2026-11-09')
  })
})

describe('a sprint in words', () => {
  it('draws To do, In progress and Done, and Backlog only when a task went back to it', () => {
    expect(barParts(counts({ TODO: 2, IN_PROGRESS: 3, DONE: 5 })).map(p => p.label)).toEqual(['To do', 'In progress', 'Done'])
    expect(barParts(counts({ BACKLOG: 1, DONE: 1 })).map(p => p.label)).toEqual(['Backlog', 'To do', 'In progress', 'Done'])
  })

  it('says what is at work now, leaving out what is not', () => {
    expect(atWorkText({ running: 2, needsYou: 1, waiting: 1 })).toBe('At work now: 2 running · 1 needs you · 1 waiting')
    expect(atWorkText({ running: 0, needsYou: 1, waiting: 0 })).toBe('At work now: 1 needs you')
    expect(atWorkText({ running: 0, needsYou: 0, waiting: 0 })).toBeNull()
  })

  it('reads a past sprint as what was done and what moved on', () => {
    expect(pastLine({ number: 3, counts: counts({ DONE: 9 }), unfinishedCount: 2, unfinishedMovedOn: true })).toBe('9 done · 2 moved to Sprint 4')
    expect(pastLine({ number: 2, counts: counts({ DONE: 7 }), unfinishedCount: 0, unfinishedMovedOn: false })).toBe('7 done')
    expect(pastLine({ number: 1, counts: counts({ DONE: 5 }), unfinishedCount: 1, unfinishedMovedOn: false })).toBe('5 done · 1 left in no sprint')
  })

  it("says what is planned in an upcoming sprint", () => {
    expect(plannedText(4)).toBe('4 tasks planned')
    expect(plannedText(0)).toBe('Nothing planned yet')
  })
})
