/**
 * The Conversations list's rows apart from the database: who may open which, where each lives, and its state.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ HttpError: class extends Error {}, prisma: {} }))

import { inboxConversationOf, inboxStatusWhere, mayOpen, placeOf, type InboxSource } from '../inboxRows'

const source = (more: Partial<InboxSource> = {}): InboxSource => ({
  id: 'c1', home: 'PERSON', projectId: null, status: 'ACTIVE', closedReason: null, title: 'Plan my week', lastSeq: 7,
  lastMessageAt: new Date('2026-11-05T08:31:00Z'), activeTurnId: null, agent: null, project: null, ...more,
})
const NONE = { unread: 0, needsYou: 0, otherLiveWork: false, lastText: null }

describe('which of their conversations a person may open', () => {
  const standing = (s: 'works' | 'reads' | 'none') => () => s

  it('opens one in their own space', () => {
    expect(mayOpen(source(), standing('none'))).toBe(true)
  })

  it('opens one in a project while they are on it, as a Viewer too', () => {
    const row = source({ home: 'PROJECT', projectId: 'p1' })
    expect(mayOpen(row, standing('works'))).toBe(true)
    expect(mayOpen(row, standing('reads'))).toBe(true)
  })

  it('leaves out one in a project they left, unless it closed because they left or it was deleted', () => {
    expect(mayOpen(source({ home: 'PROJECT', projectId: 'p1' }), standing('none'))).toBe(false)
    expect(mayOpen(source({ home: 'PROJECT', projectId: 'p1', status: 'CLOSED', closedReason: 'LEFT_PROJECT' }), standing('none'))).toBe(true)
    expect(mayOpen(source({ home: 'PROJECT', projectId: 'p1', status: 'CLOSED', closedReason: 'PROJECT_DELETED' }), standing('none'))).toBe(true)
    expect(mayOpen(source({ home: 'PROJECT', projectId: 'p1', status: 'CLOSED', closedReason: 'LEFT_ORGANISATION' }), standing('none'))).toBe(false)
  })

  it('never lists a task thread', () => {
    expect(mayOpen(source({ home: 'TASK', projectId: 'p1' }), standing('works'))).toBe(false)
  })
})

describe('where a conversation lives', () => {
  it('is the project, or the person’s space when the project is their own space', () => {
    const project = { id: 'p1', key: 'WEB', name: 'Website relaunch', personalSpace: false }
    expect(placeOf(source({ home: 'PROJECT', project }))).toEqual({ kind: 'project', id: 'p1', key: 'WEB', name: 'Website relaunch' })
    expect(placeOf(source({ home: 'PROJECT', project: { ...project, personalSpace: true } }))).toEqual({ kind: 'space' })
    expect(placeOf(source())).toEqual({ kind: 'space' })
  })
})

describe('a row’s state', () => {
  it('carries what needs the person, what is unread and the last line, made plain and cut short', () => {
    const row = inboxConversationOf(source(), { unread: 2, needsYou: 1, otherLiveWork: false, lastText: { byPerson: false, text: '**May I** run `npm run images`?' } })
    expect(row).toMatchObject({ id: 'c1', needsYou: 1, unread: 2, working: false, lastSeq: 7, lastMessageAt: '2026-11-05T08:31:00.000Z' })
    expect(row.lastLine).toEqual({ by: 'agent', text: 'May I run npm run images?' })
    const long = inboxConversationOf(source(), { ...NONE, lastText: { byPerson: true, text: 'x'.repeat(500) } })
    expect(long.lastLine?.by).toBe('you')
    expect(long.lastLine!.text.length).toBeLessThanOrEqual(140)
  })

  it('is working while a turn holds it or other work is live', () => {
    expect(inboxConversationOf(source({ activeTurnId: 't1' }), NONE).working).toBe(true)
    expect(inboxConversationOf(source(), { ...NONE, otherLiveWork: true }).working).toBe(true)
    expect(inboxConversationOf(source(), NONE)).toMatchObject({ working: false, lastLine: null })
  })
})

describe('open or archived', () => {
  it('lists the open conversations, or only the archived ones when asked', () => {
    expect(inboxStatusWhere(false)).toEqual({ status: { not: 'ARCHIVED' } })
    expect(inboxStatusWhere(true)).toEqual({ status: 'ARCHIVED' })
  })
})
