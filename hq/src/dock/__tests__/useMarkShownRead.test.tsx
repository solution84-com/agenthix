// @vitest-environment jsdom
/**
 * The conversation in sight in the panel is marked read through its newest message once the list says something in
 * it is unread — once for each newer message, and never for one out of sight.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

const h = vi.hoisted(() => ({ marked: [] as unknown[], conversations: [] as { id: string; unread: number; lastSeq: number }[] }))
vi.mock('wasp/client/operations', () => ({ markConversationRead: async (args: unknown) => { h.marked.push(args) } }))
vi.mock('../useConversationInbox', () => ({ useConversationInbox: () => ({ inbox: { conversations: h.conversations }, loaded: true }) }))

import { useMarkSeen, useMarkShownRead } from '../useMarkShownRead'

afterEach(() => { cleanup(); h.marked = []; h.conversations = [] })

describe('marking the conversation in sight read', () => {
  it('marks it through its newest message when something in it is unread, and again only for newer ones', () => {
    h.conversations = [{ id: 'c1', unread: 2, lastSeq: 7 }]
    const view = renderHook(({ id }) => useMarkShownRead(id), { initialProps: { id: 'c1' as string | null } })
    expect(h.marked).toEqual([{ conversationId: 'c1', throughSeq: 7 }])
    view.rerender({ id: 'c1' })
    expect(h.marked).toHaveLength(1)
    h.conversations = [{ id: 'c1', unread: 1, lastSeq: 9 }]
    view.rerender({ id: 'c1' })
    expect(h.marked).toEqual([{ conversationId: 'c1', throughSeq: 7 }, { conversationId: 'c1', throughSeq: 9 }])
  })

  it('leaves alone one with nothing unread, and one out of sight', () => {
    h.conversations = [{ id: 'c1', unread: 0, lastSeq: 7 }, { id: 'c2', unread: 3, lastSeq: 4 }]
    const view = renderHook(({ id }) => useMarkShownRead(id), { initialProps: { id: 'c1' as string | null } })
    view.rerender({ id: null })
    expect(h.marked).toEqual([])
    view.rerender({ id: 'c2' })
    expect(h.marked).toEqual([{ conversationId: 'c2', throughSeq: 4 }])
  })
})

describe('marking a task’s conversation read from what its thread shows', () => {
  it('marks it through the newest message shown, once for each newer one', () => {
    const view = renderHook(() => useMarkSeen('t1', true))
    view.result.current(3)
    view.result.current(3)
    view.result.current(2)
    view.result.current(5)
    expect(h.marked).toEqual([{ conversationId: 't1', throughSeq: 3 }, { conversationId: 't1', throughSeq: 5 }])
  })

  it('marks nothing while the conversation is out of sight', () => {
    const view = renderHook(() => useMarkSeen('t1', false))
    view.result.current(3)
    expect(h.marked).toEqual([])
  })
})
