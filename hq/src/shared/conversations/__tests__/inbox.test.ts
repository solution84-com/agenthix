/**
 * The Conversations list's filters and counts: Needs you and Unread are toggles (none, either or both), the badge
 * counts each waiting conversation once, and a pinned place's tile sums what is in it.
 */
import { describe, expect, it } from 'vitest'
import {
  dayHeading, filterInbox, groupByDay, inboxTotals, NO_FILTERS, placeSignals, placeSignalWords, type InboxConversation,
} from '../inbox'

const web = { kind: 'project' as const, id: 'p1', key: 'WEB', name: 'Website relaunch' }
const row = (id: string, more: Partial<InboxConversation> = {}): InboxConversation => ({
  id, title: `Talk ${id}`, place: { kind: 'space' }, agent: null, lastMessageAt: '2026-11-05T08:00:00Z', lastSeq: 1,
  lastLine: null, needsYou: 0, unread: 0, working: false, ...more,
})
const list = [
  row('needs', { needsYou: 1, place: web }),
  row('unread', { unread: 2, place: web }),
  row('both', { needsYou: 1, unread: 1 }),
  row('quiet', { working: true, place: web, title: 'Redirects', lastLine: { by: 'agent', text: 'Developer is working' } }),
]
const ids = (rows: InboxConversation[]) => rows.map((r) => r.id)

describe('the list’s filters', () => {
  it('with neither on, show everything, newest first as given', () => {
    expect(ids(filterInbox(list, NO_FILTERS))).toEqual(['needs', 'unread', 'both', 'quiet'])
  })

  it('with one on, keep what matches it', () => {
    expect(ids(filterInbox(list, { needsYou: true, unread: false }))).toEqual(['needs', 'both'])
    expect(ids(filterInbox(list, { needsYou: false, unread: true }))).toEqual(['unread', 'both'])
  })

  it('with both on, keep everything waiting, in order', () => {
    expect(ids(filterInbox(list, { needsYou: true, unread: true }))).toEqual(['needs', 'unread', 'both'])
  })

  it('search the title, the agent, the place and the last line', () => {
    expect(ids(filterInbox(list, NO_FILTERS, 'redirects'))).toEqual(['quiet'])
    expect(ids(filterInbox(list, NO_FILTERS, 'website'))).toEqual(['needs', 'unread', 'quiet'])
    expect(ids(filterInbox(list, NO_FILTERS, 'is working'))).toEqual(['quiet'])
    expect(ids(filterInbox(list, { needsYou: true, unread: false }, 'website'))).toEqual(['needs'])
  })
})

describe('the totals', () => {
  it('count each waiting conversation once on the badge, whatever the filters', () => {
    expect(inboxTotals(list)).toEqual({ waiting: 3, needsYou: 2, unread: 2 })
  })
})

describe('a pinned place’s tile', () => {
  it('sums what is going on in its conversations; null is the person’s own space', () => {
    expect(placeSignals(list, 'p1')).toEqual({ needsYou: 1, unread: 1, working: true, conversations: 3 })
    expect(placeSignals(list, null)).toEqual({ needsYou: 1, unread: 1, working: false, conversations: 1 })
    expect(placeSignals(list, 'p9')).toEqual({ needsYou: 0, unread: 0, working: false, conversations: 0 })
  })

  it('says it in words on hover', () => {
    expect(placeSignalWords('Website relaunch', placeSignals(list, 'p1'))).toBe('Website relaunch · 1 needs you · 1 unread · working · 3 conversations')
    expect(placeSignalWords('Your space', placeSignals([], null))).toBe('Your space · 0 conversations')
  })
})

describe('the order agrees with the times shown', () => {
  const at = (id: string, lastMessageAt: string) => row(id, { lastMessageAt })

  it('lists newest first by the time each row shows, whatever order they arrive in', () => {
    const arrived = [at('16:30', '2026-11-05T16:30:00Z'), at('19:30', '2026-11-05T19:30:00Z'), at('18:30', '2026-11-05T18:30:00Z')]
    expect(ids(filterInbox(arrived, NO_FILTERS))).toEqual(['19:30', '18:30', '16:30'])
    expect(ids(filterInbox(arrived, { needsYou: false, unread: false }, 'talk'))).toEqual(['19:30', '18:30', '16:30'])
  })

  it('keeps the given order for rows with the same time', () => {
    expect(ids(filterInbox([row('a'), row('b'), row('c')], NO_FILTERS))).toEqual(['a', 'b', 'c'])
  })
})

describe('day headings', () => {
  const now = new Date(2026, 10, 6, 12, 0)
  const local = (day: number, h: number) => new Date(2026, 10, day, h).toISOString()

  it('names Today and Yesterday, then the date, with the year only for another year', () => {
    expect(dayHeading(new Date(2026, 10, 6, 1), now)).toBe('Today')
    expect(dayHeading(new Date(2026, 10, 5, 23), now)).toBe('Yesterday')
    expect(dayHeading(new Date(2026, 9, 30, 9), now)).toBe('30 Oct')
    expect(dayHeading(new Date(2025, 11, 31, 9), now)).toBe('31 Dec 2025')
  })

  it('dates a time on a later day (a clock ahead, or sample data) rather than calling it Today', () => {
    expect(dayHeading(new Date(2026, 10, 7, 9), now)).toBe('7 Nov')
  })

  it('groups consecutive rows under one heading', () => {
    const rows = [row('a', { lastMessageAt: local(6, 9) }), row('b', { lastMessageAt: local(6, 8) }), row('c', { lastMessageAt: local(5, 20) })]
    expect(groupByDay(rows, now).map((g) => [g.heading, ids(g.rows)])).toEqual([['Today', ['a', 'b']], ['Yesterday', ['c']]])
  })
})
