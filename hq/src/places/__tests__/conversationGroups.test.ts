import { describe, it, expect } from 'vitest'
import { groupByRecency, rowTime } from '../conversationGroups'

// Local time throughout: "today" is the person's calendar day, not a 24-hour window.
const now = new Date(2026, 9, 6, 15, 0) // 6 Oct 2026, 15:00
const at = (day: number, hour = 9, month = 9, year = 2026) => ({ id: `${year}-${month}-${day}-${hour}`, at: new Date(year, month, day, hour) })

describe('groupByRecency @SC-495', () => {
  it('groups by calendar day: Today, Yesterday, Last 7 days, Older', () => {
    const rows = [at(6, 14), at(6, 0), at(5, 23), at(5, 1), at(4), at(29, 9, 8), at(28, 9, 8), at(1, 9, 0)]
    const groups = groupByRecency(rows, (r) => r.at, now)
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 2],
      ['Last 7 days', 2],
      ['Older', 2],
    ])
  })

  it('keeps the order rows arrive in within a group', () => {
    const rows = [at(6, 14), at(6, 9), at(6, 11)]
    expect(groupByRecency(rows, (r) => r.at, now)[0].rows.map((r) => r.at.getHours())).toEqual([14, 9, 11])
  })

  it('leaves out a group with nothing in it', () => {
    const groups = groupByRecency([at(6), at(1, 9, 0)], (r) => r.at, now)
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Older'])
  })

  it('puts the seventh day back in Last 7 days and the eighth in Older', () => {
    const groups = groupByRecency([at(29, 9, 8), at(28, 9, 8)], (r) => r.at, now)
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([['Last 7 days', 1], ['Older', 1]])
  })

  it('reads ISO strings as well as dates', () => {
    const groups = groupByRecency([{ at: new Date(2026, 9, 5, 12).toISOString() }], (r) => r.at, now)
    expect(groups[0].label).toBe('Yesterday')
  })

  it('returns no groups for no rows', () => {
    expect(groupByRecency([], () => now, now)).toEqual([])
  })
})

describe('rowTime @SC-495', () => {
  it('shows the time of day for today', () => {
    expect(rowTime(new Date(2026, 9, 6, 9, 5), now)).toBe('09:05')
  })

  it('shows the day and month for an earlier day this year', () => {
    expect(rowTime(new Date(2026, 8, 30, 9), now)).toBe('30 Sep')
  })

  it('adds the year for an earlier year', () => {
    expect(rowTime(new Date(2025, 11, 31, 9), now)).toBe('31 Dec 2025')
  })
})
