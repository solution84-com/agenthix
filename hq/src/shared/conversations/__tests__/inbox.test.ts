/**
 * The Conversations list's filters and counts: Needs you and Unread are toggles (none, either or both), the badge
 * counts each waiting conversation once, and a pinned place's tile sums what is in it.
 */
import { describe, expect, it } from 'vitest'
import {
  filterInbox, inboxTotals, NO_FILTERS, placeSignals, placeSignalWords, type InboxConversation,
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
