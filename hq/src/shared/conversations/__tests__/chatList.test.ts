/**
 * The Chat page's list: its view in the address (so the bar can carry its search and filters over), and the
 * project and agent filters on top of the bar's.
 */
import { describe, expect, it } from 'vitest'
import { chatListChoices, chatListPath, EMPTY_VIEW, filterChatList, readChatList, SPACE_FILTER, withChatList } from '../chatList'
import type { InboxConversation } from '../inbox'

const agent = (id: string, name: string) => ({ id, name, avatarUrl: null }) as unknown as InboxConversation['agent']
const web = { kind: 'project' as const, id: 'p1', key: 'WEB', name: 'Website relaunch' }
const row = (id: string, more: Partial<InboxConversation> = {}): InboxConversation => ({
  id, title: `Talk ${id}`, place: { kind: 'space' }, agent: null, lastMessageAt: '2026-11-05T08:00:00Z', lastSeq: 1,
  lastLine: null, needsYou: 0, unread: 0, working: false, ...more,
})
const list = [
  row('a', { place: web, agent: agent('w', 'Writer'), needsYou: 1 }),
  row('b', { place: web, agent: agent('d', 'Developer'), lastLine: { by: 'agent', text: 'Both load full-size photos' } }),
  row('c', { agent: agent('w', 'Writer'), unread: 2 }),
]
const ids = (rows: InboxConversation[]) => rows.map((r) => r.id)

describe('the list’s view in the address', () => {
  it('reads what the bar carried over: the search and both toggles', () => {
    expect(readChatList('?q=photos&needs=1&unread=1')).toEqual({
      ...EMPTY_VIEW, search: 'photos', filters: { needsYou: true, unread: true },
    })
  })

  it('reads an empty address as the whole list', () => {
    expect(readChatList('')).toEqual(EMPTY_VIEW)
    expect(readChatList('?c=abc')).toEqual(EMPTY_VIEW)
  })

  it('writes what is on and leaves out what is off, keeping the address’s other parameters', () => {
    const view = { ...EMPTY_VIEW, search: ' photos ', place: 'p1', agentId: 'w', archived: true }
    const written = withChatList('?c=abc&needs=1', view)
    expect(written.get('c')).toBe('abc')
    expect(written.has('needs')).toBe(false)
    expect(readChatList(`?${written}`)).toEqual({ ...view, search: 'photos' })
    expect(written.has('agent')).toBe(false)
  })

  it('makes the Chat page’s address for a view', () => {
    expect(chatListPath('/chat', {})).toBe('/chat')
    expect(chatListPath('/chat', { search: 'a b', filters: { needsYou: true, unread: false } })).toBe('/chat?q=a+b&needs=1')
  })
})

describe('the list’s filters', () => {
  it('narrows by project, by agent, or by your space', () => {
    expect(ids(filterChatList(list, { ...EMPTY_VIEW, place: 'p1' }))).toEqual(['a', 'b'])
    expect(ids(filterChatList(list, { ...EMPTY_VIEW, place: SPACE_FILTER }))).toEqual(['c'])
    expect(ids(filterChatList(list, { ...EMPTY_VIEW, agentId: 'w' }))).toEqual(['a', 'c'])
  })

  it('searches the title, the agent, the place and the last line, together with the others', () => {
    expect(ids(filterChatList(list, { ...EMPTY_VIEW, search: 'full-size' }))).toEqual(['b'])
    expect(ids(filterChatList(list, { ...EMPTY_VIEW, search: 'writer', filters: { needsYou: true, unread: false } }))).toEqual(['a'])
  })

  it('offers only the projects and agents that have a conversation in the list', () => {
    expect(chatListChoices(list)).toEqual({
      places: [{ id: 'p1', name: 'Website relaunch' }, { id: SPACE_FILTER, name: 'Your space' }],
      agents: [{ id: 'd', name: 'Developer' }, { id: 'w', name: 'Writer' }],
    })
  })
})
