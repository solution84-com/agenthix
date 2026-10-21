import { describe, expect, it } from 'vitest'
import type { ConversationMessageView } from '../../../shared/conversations/protocol'
import {
  actionErrorText, applyDelta, clientIdFor, applyReplay, applySteps, mergeMessages, newClientMessageId, oldestSeq, stepsAfterEnd,
  streamAfterMessage, threadMessages, waitingOf,
} from '../threadState'

function msg(seq: number, over: Partial<ConversationMessageView> = {}): ConversationMessageView {
  return {
    id: `m${seq}`, seq, clientMessageId: null, role: 'PERSON', authorId: 'u1', agentId: null, kind: 'TEXT',
    body: { text: `message ${seq}` }, spoken: false, interrupted: false, operationId: null, turnId: null,
    queueState: null, createdAt: '2026-10-16T10:00:00.000Z', ...over,
  } as ConversationMessageView
}

describe('mergeMessages @SC-1004', () => {
  it('keeps messages oldest first and each id once', () => {
    const merged = mergeMessages([msg(3), msg(4)], [msg(1), msg(2), msg(3)])
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3, 4])
  })

  it('lets an incoming copy replace the held one', () => {
    const waiting = msg(5, { queueState: 'WAITING' })
    const taken = msg(5, { queueState: 'TAKEN' })
    expect(mergeMessages([waiting], [taken])[0].queueState).toBe('TAKEN')
  })
})

describe('what is in the thread and what waits @SC-1004', () => {
  const all = [msg(1), msg(2, { queueState: 'TAKEN' }), msg(3, { queueState: 'WAITING' }), msg(4, { queueState: 'CANCELLED' })]

  it('leaves waiting and cancelled messages out of the thread', () => {
    expect(threadMessages(all).map((m) => m.seq)).toEqual([1, 2])
  })

  it('lists the waiting ones', () => {
    expect(waitingOf(all).map((m) => m.seq)).toEqual([3])
  })

  it('pages back from the oldest held', () => {
    expect(oldestSeq(all)).toBe(1)
    expect(oldestSeq([])).toBeUndefined()
  })
})

describe('streamed text @SC-1004', () => {
  const event = (offset: number, text: string, turnId = 't1') => ({ conversationId: 'c1', turnId, offset, text })

  it('starts a reply at offset 0 and appends in order', () => {
    let { stream } = applyDelta(null, event(0, 'Hel'))
    ;({ stream } = applyDelta(stream, event(3, 'lo')))
    expect(stream).toEqual({ turnId: 't1', text: 'Hello' })
  })

  it('drops text already seen', () => {
    const held = { turnId: 't1', text: 'Hello' }
    expect(applyDelta(held, event(0, 'Hel')).stream).toBe(held)
    expect(applyDelta(held, event(0, 'Hello')).stream).toBe(held)
  })

  it('adds only the part of an overlapping delta that is new', () => {
    const held = { turnId: 't1', text: 'Hello' }
    expect(applyDelta(held, event(3, 'lo wor')).stream?.text).toBe('Hello wor')
  })

  it('reports a gap and holds nothing new when text is missing before it', () => {
    const held = { turnId: 't1', text: 'Hel' }
    expect(applyDelta(held, event(10, 'x'))).toEqual({ stream: held, gap: true })
    expect(applyDelta(null, event(4, 'x'))).toEqual({ stream: null, gap: true })
  })

  it('starts afresh for another reply', () => {
    const held = { turnId: 't1', text: 'Old' }
    expect(applyDelta(held, event(0, 'New', 't2')).stream).toEqual({ turnId: 't2', text: 'New' })
  })

  it('takes a replay, but never one shorter than what is held', () => {
    const held = { turnId: 't1', text: 'Hello there' }
    expect(applyReplay(held, { conversationId: 'c1', turnId: 't1', text: 'Hello' })).toBe(held)
    expect(applyReplay(held, { conversationId: 'c1', turnId: 't1', text: 'Hello there, friend' }).text).toBe('Hello there, friend')
    expect(applyReplay(null, { conversationId: 'c1', turnId: 't1', text: 'Hi' })).toEqual({ turnId: 't1', text: 'Hi' })
  })

  it('is replaced by the committed reply of the same turn only', () => {
    const held = { turnId: 't1', text: 'Hello' }
    expect(streamAfterMessage(held, msg(2, { role: 'AGENT', turnId: 't1' }))).toBeNull()
    expect(streamAfterMessage(held, msg(2, { role: 'AGENT', turnId: 't2' }))).toBe(held)
    expect(streamAfterMessage(held, msg(2, { role: 'PERSON', turnId: 't1' }))).toBe(held)
    expect(streamAfterMessage(held, msg(2, { role: 'AGENT', kind: 'FAILED', turnId: 't1' }))).toBeNull()
  })

  it('is kept when the turn writes an action line, a card or work started @SC-1041', () => {
    const held = { turnId: 't1', text: 'Hel' }
    for (const kind of ['ACTION', 'TASK', 'OPERATION_STARTED'] as const) {
      expect(streamAfterMessage(held, msg(2, { role: 'AGENT', kind, turnId: 't1' }))).toBe(held)
    }
  })
})

describe("the running reply's steps @SC-1005", () => {
  it('count from when the reply began on this clock, kept as later steps arrive', () => {
    const first = applySteps(null, { turnId: 't1', elapsedMs: 2_000, steps: [{ label: 'Your projects' }] }, 10_000)
    expect(first).toEqual({ turnId: 't1', since: 8_000, steps: [{ label: 'Your projects' }] })
    const later = applySteps(first, { turnId: 't1', elapsedMs: 4_500, steps: [{ label: 'Your projects', ms: 2_000 }] }, 12_000)
    expect(later.since).toBe(8_000)
    expect(applySteps(later, { turnId: 't2', elapsedMs: 0, steps: [] }, 20_000).since).toBe(20_000)
  })

  it('go when that reply ends, and only that one', () => {
    const held = { turnId: 't1', since: 0, steps: [] }
    expect(stepsAfterEnd(held, 't1')).toBeNull()
    expect(stepsAfterEnd(held, 't2')).toBe(held)
  })
})

describe('client message id @SC-1004', () => {
  it('is a new value each time it is made', () => {
    expect(newClientMessageId()).not.toBe(newClientMessageId())
  })
})

describe('the id of a message being sent @SC-1004', () => {
  it('stays the same when the same text is sent again after a failure', () => {
    const first = clientIdFor(null, 'hello')
    expect(clientIdFor(first, 'hello')).toBe(first)
  })

  it('is new for different text', () => {
    const first = clientIdFor(null, 'hello')
    expect(clientIdFor(first, 'hello again').id).not.toBe(first.id)
  })
})

describe('a refused action @SC-1012', () => {
  it('shows the reason the server gave', () => {
    expect(actionErrorText(new Error('This conversation is closed.'))).toBe('This conversation is closed.')
  })

  it('says something plain when there is no reason', () => {
    expect(actionErrorText(undefined)).toBe('That did not work. Try again.')
    expect(actionErrorText(new Error('  '))).toBe('That did not work. Try again.')
  })
})
