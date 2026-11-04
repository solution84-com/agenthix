// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'

const h = vi.hoisted(() => {
  const handlers = new Map<string, (e: unknown) => void>()
  return {
    handlers,
    emitted: [] as unknown[][],
    socket: {
      on: (event: string, fn: (e: unknown) => void) => { handlers.set(event, fn) },
      off: (event: string) => { handlers.delete(event) },
      emit: (...args: unknown[]) => { h.emitted.push(args) },
    },
    view: { data: undefined as unknown, error: null as unknown, refetch: vi.fn() },
    activity: { data: undefined as unknown, refetch: vi.fn() },
    answer: vi.fn(),
    cancelOp: vi.fn(),
    getMessages: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    sendNow: vi.fn(),
    cancel: vi.fn(),
  }
})
vi.mock('wasp/client/operations', () => ({
  getConversation: 'getConversation',
  getConversationActivity: 'getConversationActivity',
  useQuery: (q: string) => (q === 'getConversationActivity' ? h.activity : h.view),
  answerConversationApproval: (...a: unknown[]) => h.answer(...a),
  cancelConversationOperation: (...a: unknown[]) => h.cancelOp(...a),
  getConversationMessages: (...a: unknown[]) => h.getMessages(...a),
  sendConversationMessage: (...a: unknown[]) => h.send(...a),
  stopConversationTurn: (...a: unknown[]) => h.stop(...a),
  sendWaitingConversationMessageNow: (...a: unknown[]) => h.sendNow(...a),
  cancelWaitingConversationMessage: (...a: unknown[]) => h.cancel(...a),
  switchConversationAccess: vi.fn(),
}))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: h.socket }) }))

import { useConversationThread } from '../useConversationThread'

function msg(seq: number, over: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT',
    body: { text: `message ${seq}` }, spoken: false, interrupted: false, operationId: null, turnId: null,
    queueState: null, createdAt: '2026-10-16T10:00:00.000Z', ...over,
  } as ConversationMessageView
}
const view = { id: 'c1', waiting: [] as ConversationMessageView[], activeTurnId: null as string | null }
const fire = (event: string, payload: unknown) => act(() => { h.handlers.get(event)!(payload) })

beforeEach(() => {
  h.handlers.clear()
  h.emitted.length = 0
  h.view.data = view
  h.view.refetch.mockReset().mockResolvedValue(undefined)
  h.activity.data = undefined
  h.activity.refetch.mockReset().mockResolvedValue(undefined)
  h.answer.mockReset().mockResolvedValue({ messageId: 'a1', seq: 9, queued: false, duplicate: false })
  h.cancelOp.mockReset().mockResolvedValue(undefined)
  h.getMessages.mockReset().mockResolvedValue({ messages: [msg(2), msg(1)], hasMore: false })
  h.send.mockReset().mockResolvedValue({ messageId: 'm3', seq: 3, queued: false, duplicate: false })
})
afterEach(cleanup)

async function mounted() {
  const hook = renderHook(() => useConversationThread('c1'))
  await waitFor(() => expect(hook.result.current.loaded).toBe(true))
  return hook
}

describe('a conversation\'s thread @SC-1004', () => {
  it('shows the latest page oldest first and joins the conversation\'s room', async () => {
    const { result } = await mounted()
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2])
    expect(h.emitted.some((e) => e[0] === 'subscribeToConversation' && e[1] === 'c1')).toBe(true)
  })

  it('reads the conversation again once the room has it, so a reply that ended before the join does not stay running', async () => {
    h.view.data = { ...view, activeTurnId: 't1' }
    await mounted()
    const join = h.emitted.find((e) => e[0] === 'subscribeToConversation')!
    expect(typeof join[2]).toBe('function')
    const reads = h.getMessages.mock.calls.length
    h.view.refetch.mockClear()
    await act(async () => { (join[2] as (ok: boolean) => void)(true) })
    expect(h.view.refetch).toHaveBeenCalled()
    expect(h.getMessages.mock.calls.length).toBe(reads + 1)
  })

  it('stops showing a reply running once the compaction that held the lock has ended or failed', async () => {
    h.view.data = { ...view, activeTurnId: 'compaction-holder' }
    const { result } = await mounted()
    expect(result.current.running).toBe(true)
    fire('conversation:summarise', { conversationId: 'c1', state: 'started' })
    expect(result.current.running).toBe(true)
    fire('conversation:summarise', { conversationId: 'c1', state: 'ended' })
    expect(result.current.running).toBe(false)
    fire('conversation:turn', { conversationId: 'c1', turnId: 't9', state: 'RUNNING' })
    expect(result.current.running).toBe(true)
    fire('conversation:summarise', { conversationId: 'c1', state: 'failed', reason: 'no' })
    expect(result.current.running).toBe(false)
  })

  it('pages back from the oldest message held, and keeps what it had', async () => {
    h.getMessages.mockResolvedValueOnce({ messages: [msg(4), msg(3)], hasMore: true })
    const { result } = await mounted()
    h.getMessages.mockResolvedValueOnce({ messages: [msg(2), msg(1)], hasMore: false })
    await act(() => result.current.loadOlder())
    expect(h.getMessages).toHaveBeenLastCalledWith({ conversationId: 'c1', beforeSeq: 3 })
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4])
    expect(result.current.hasMore).toBe(false)
  })

  it('merges a streamed reply by offset and drops text it has seen', async () => {
    const { result } = await mounted()
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 0, text: 'Hel' })
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 0, text: 'Hel' })
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 3, text: 'lo' })
    expect(result.current.stream?.text).toBe('Hello')
    expect(result.current.running).toBe(true)
    // The pill counts from when the turn began on this screen, before it has taken a step.
    expect(result.current.turnId).toBe('t1')
    expect(typeof result.current.turnSince).toBe('number')
  })

  it('asks for the replay again when text is missing, and takes it', async () => {
    const { result } = await mounted()
    h.emitted.length = 0
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 40, text: 'late' })
    expect(h.emitted.some((e) => e[0] === 'subscribeToConversation' && e[1] === 'c1')).toBe(true)
    fire('conversation:replay', { conversationId: 'c1', turnId: 't1', text: 'All that was written so far' })
    expect(result.current.stream?.text).toBe('All that was written so far')
  })

  it('swaps the streamed text for the committed reply, drawn once', async () => {
    const { result } = await mounted()
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 0, text: 'Hello' })
    fire('conversation:message', { conversationId: 'c1', message: msg(3, { role: 'AGENT', turnId: 't1', body: { text: 'Hello' } }) })
    expect(result.current.stream).toBeNull()
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2, 3])
  })

  it('keeps streaming the reply after the turn writes an action line @SC-1041', async () => {
    const { result } = await mounted()
    fire('conversation:message', { conversationId: 'c1', message: msg(3, { role: 'AGENT', kind: 'ACTION', turnId: 't1', body: { text: 'Created WAL-2', toolName: 'create_task' } }) })
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 0, text: 'Done' })
    fire('conversation:delta', { conversationId: 'c1', turnId: 't1', offset: 4, text: ', WAL-2' })
    expect(result.current.stream?.text).toBe('Done, WAL-2')
  })

  it('ignores events of another conversation', async () => {
    const { result } = await mounted()
    fire('conversation:delta', { conversationId: 'other', turnId: 't1', offset: 0, text: 'Hello' })
    fire('conversation:message', { conversationId: 'other', message: msg(9) })
    expect(result.current.stream).toBeNull()
    expect(result.current.messages).toHaveLength(2)
  })

  it('shows a message sent during a reply as waiting, and moves it into the thread when taken', async () => {
    const { result } = await mounted()
    fire('conversation:message', { conversationId: 'c1', message: msg(3, { queueState: 'WAITING' }) })
    expect(result.current.waiting.map((m) => m.seq)).toEqual([3])
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2])
    fire('conversation:messageUpdated', { conversationId: 'c1', message: msg(3, { queueState: 'TAKEN' }) })
    expect(result.current.waiting).toEqual([])
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2, 3])
  })

  it('stops showing a taken-back message', async () => {
    const { result } = await mounted()
    fire('conversation:message', { conversationId: 'c1', message: msg(3, { queueState: 'WAITING' }) })
    fire('conversation:messageUpdated', { conversationId: 'c1', message: msg(3, { queueState: 'CANCELLED' }) })
    expect(result.current.waiting).toEqual([])
    expect(result.current.messages.map((m) => m.seq)).toEqual([1, 2])
  })

  it('shows the typing state while a reply runs and clears it when the reply ends', async () => {
    const { result } = await mounted()
    fire('conversation:turn', { conversationId: 'c1', turnId: 't1', state: 'RUNNING' })
    expect(result.current.running).toBe(true)
    fire('conversation:turn', { conversationId: 'c1', turnId: 't1', state: 'FAILED', error: 'busy' })
    expect(result.current.running).toBe(false)
  })

  it('sends a retry with the client id of the attempt that failed', async () => {
    h.send.mockRejectedValueOnce(new Error('Reply could not start'))
    const { result } = await mounted()
    await act(async () => { expect(await result.current.send('Hello')).toBe(false) })
    expect(result.current.actionError).toBe('Reply could not start')
    await act(async () => { expect(await result.current.send('Hello')).toBe(true) })
    expect(h.send.mock.calls[1][0].clientMessageId).toBe(h.send.mock.calls[0][0].clientMessageId)
    await act(async () => { await result.current.send('Something else') })
    expect(h.send.mock.calls[2][0].clientMessageId).not.toBe(h.send.mock.calls[0][0].clientMessageId)
  })

  it('stops the reply and sends a waiting message now through the conversation\'s actions', async () => {
    const { result } = await mounted()
    await act(() => result.current.stop())
    await act(() => result.current.sendNow('m3'))
    await act(() => result.current.cancelWaiting('m4'))
    expect(h.stop).toHaveBeenCalledWith({ conversationId: 'c1' })
    expect(h.sendNow).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'm3' })
    expect(h.cancel).toHaveBeenCalledWith({ conversationId: 'c1', messageId: 'm4' })
  })

  it('leaves the room when the screen goes', async () => {
    const hook = await mounted()
    h.emitted.length = 0
    hook.unmount()
    expect(h.emitted).toContainEqual(['unsubscribeFromConversation', 'c1'])
  })
})

describe('the work underway @SC-972 @SC-1009', () => {
  it('reads the work again when the room says it changed, and not for another conversation', async () => {
    await mounted()
    h.activity.refetch.mockClear()
    fire('conversation:operation', { conversationId: 'other', operationId: 'o1', state: 'RUNNING', title: 'x' })
    expect(h.activity.refetch).not.toHaveBeenCalled()
    fire('conversation:operation', { conversationId: 'c1', operationId: 'o1', state: 'RUNNING', title: 'x' })
    expect(h.activity.refetch).toHaveBeenCalled()
  })

  it('keeps the live lines the room sends, by work, and drops them when none are left', async () => {
    const { result } = await mounted()
    fire('conversation:operationLines', { conversationId: 'c1', operationId: 'o1', lines: ['Shop · Profile it'], endedHelpers: 0 })
    expect(result.current.liveLines.o1).toEqual({ lines: ['Shop · Profile it'], endedHelpers: 0 })
    fire('conversation:operationLines', { conversationId: 'c1', operationId: 'o1', lines: [], endedHelpers: 0 })
    expect(result.current.liveLines).toEqual({})
  })

  it('answers an approval with the same client id when the answer is sent again after a refusal', async () => {
    h.answer.mockRejectedValueOnce(new Error('Not built yet')).mockResolvedValue({ messageId: 'a1', seq: 9, queued: false, duplicate: false })
    const { result } = await mounted()
    await act(() => result.current.answerApproval('o1', 'approve'))
    expect(result.current.actionError).toBe('Not built yet')
    await act(() => result.current.answerApproval('o1', 'approve'))
    const [first, second] = h.answer.mock.calls.map((c) => c[0])
    expect(first).toMatchObject({ conversationId: 'c1', operationId: 'o1', answer: 'approve' })
    expect(second.clientMessageId).toBe(first.clientMessageId)
  })

  it('stops work and shows the server\'s words when it refuses', async () => {
    h.cancelOp.mockRejectedValueOnce(new Error('Not built yet'))
    const { result } = await mounted()
    await act(() => result.current.stopOperation('o1'))
    expect(h.cancelOp).toHaveBeenCalledWith({ conversationId: 'c1', operationId: 'o1' })
    expect(result.current.actionError).toBe('Not built yet')
  })
})
