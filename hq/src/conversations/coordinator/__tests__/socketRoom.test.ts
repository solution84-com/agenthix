/**
 * Joining a conversation's room (conversation layer spec, Failure, recovery): only after the reading rule, and
 * a socket that joins while a turn streams is sent what it has streamed so far.
 */
import { describe, it, expect } from 'vitest'
import { HttpError } from 'wasp/server'
import { CONVERSATION_SOCKET } from '../../../shared/conversations/protocol'
import { joinConversationRoom, replayFor } from '../socketRoom'
import { endLive, startLive } from '../liveTurns'

function socket(userId: string | null = 'u1') {
  const joined: string[] = []
  const emitted: { event: string; payload: unknown }[] = []
  return {
    joined, emitted,
    id: 's1',
    data: userId ? { user: { id: userId } } : {},
    join(room: string) { joined.push(room) },
    leave() {},
    emit(event: string, payload: unknown) { emitted.push({ event, payload }) },
    on() {},
  }
}

const log = { info() {}, warn() {} }
const reads = async () => ({ id: 'c1', home: 'PERSON' as const, projectId: null, taskId: null, openedById: 'u1', agentId: 'a' })
const refuses = async (): Promise<never> => { throw new HttpError(404, 'Conversation not found') }

describe('joining a conversation room', () => {
  it('joins the room of a conversation the person may read', async () => {
    const s = socket()
    expect(await joinConversationRoom(s, 'c1', reads, log)).toBe(true)
    expect(s.joined).toEqual(['conversation:c1'])
    expect(s.emitted).toEqual([])
  })

  it('refuses a conversation the person may not read, and a payload that is not an id', async () => {
    const s = socket()
    expect(await joinConversationRoom(s, 'c1', refuses, log)).toBe(false)
    expect(await joinConversationRoom(s, { id: 'c1' }, reads, log)).toBe(false)
    expect(await joinConversationRoom(socket(null), 'c1', reads, log)).toBe(false)
    expect(s.joined).toEqual([])
  })

  it('replays what the running turn has streamed so far, to the joining socket only', async () => {
    const live = startLive('c2', 'turn-7')
    live.text = 'Half of it'
    try {
      const s = socket()
      await joinConversationRoom(s, 'c2', reads, log)
      expect(s.emitted).toEqual([{ event: CONVERSATION_SOCKET.replay, payload: { conversationId: 'c2', turnId: 'turn-7', text: 'Half of it' } }])
    } finally {
      endLive('c2', 'turn-7')
    }
  })

  it("replays the running reply's steps with how long it has worked, so the pill counts on from there @SC-1005", () => {
    const live = startLive('c3', 'turn-8')
    live.steps = { from: new Date(10_000), steps: [{ label: 'Your projects', ms: 2_100 }, { label: 'The tasks' }] }
    try {
      expect(replayFor('c3', new Date(16_500))).toEqual({
        conversationId: 'c3', turnId: 'turn-8', text: '',
        steps: { elapsedMs: 6_500, steps: [{ label: 'Your projects', ms: 2_100 }, { label: 'The tasks' }] },
      })
    } finally {
      endLive('c3', 'turn-8')
    }
  })
})
