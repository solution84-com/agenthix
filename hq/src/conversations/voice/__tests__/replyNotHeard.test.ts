/**
 * A reply written whole before the person was heard to go on, or to speak over it (adaptive voice listening, spec §What
 * is stored, §The recap): withdrawn, the lines heard while they spoke leave its message for the message that answers
 * again; withdrawn or cut, its recap is stopped. A reply heard to its end keeps both. The record's database is replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const row = { id: 'm1', conversationId: 'c1', role: 'AGENT', kind: 'TEXT', text: '' }
vi.mock('wasp/server', () => ({
  HttpError: class extends Error {},
  prisma: { conversation: { findUnique: vi.fn(async () => null) }, conversationMessage: { findFirst: vi.fn(async () => row) } },
}))
vi.mock('../../readingRule', () => ({ requireConversationSpeaker: vi.fn() }))
vi.mock('../holder', () => ({ releaseVoice: vi.fn(async () => null), takeVoice: vi.fn(), clearVoiceHolders: vi.fn(async () => []) }))
vi.mock('../speech', () => ({ toRoom: vi.fn(), toSockets: vi.fn(), sessionDeps: vi.fn(), agentVoice: vi.fn() }))
vi.mock('../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../coordinator/liveTurns', () => ({ liveTurn: vi.fn(() => null), stopLive: vi.fn() }))
vi.mock('../../coordinator/events', () => ({ conversationEvents: { message: vi.fn(), messageUpdated: vi.fn() } }))
vi.mock('../../coordinator/turnRecord', () => ({ requestStop: vi.fn() }))
vi.mock('../../store/messages', () => ({
  keepHeardText: vi.fn(async () => ({})),
  toMessageView: vi.fn((r: typeof row) => ({ kind: 'TEXT', body: { text: r.text } })),
}))
vi.mock('../../conversationQueries', () => ({ accessState: vi.fn() }))
vi.mock('../../../voice/speechScope', () => ({ scopeOfConversation: vi.fn() }))
vi.mock('../phrases', () => ({ phraseClips: vi.fn() }))
vi.mock('../listening', () => ({ listeningStarted: vi.fn(), listeningEnded: vi.fn() }))
vi.mock('../availability', () => ({ loadVoiceFacts: vi.fn(), inUse: vi.fn(), voiceRefusal: vi.fn(), voiceStartedAt: vi.fn() }))
vi.mock('../../../sessions/transcriptAuthors', () => ({ personName: vi.fn() }))

import { keepHeardText } from '../../store/messages'
import { openVoiceSession, resetVoiceSessions } from '../registry'
import { cancelReply } from '../service'
import { withHeardLines } from '../listening/heard'
import { listeningOf } from '../listening/state'

const HOLD = 'Right, let me think about that rota.'

/** A reply under the light model, its hold heard, written whole as `m1`; the recap's signal. */
function writtenReply() {
  // eslint-disable-next-line require-yield
  async function* synthesize() { return }
  const session = openVoiceSession('c1', 'u1', 's1', { synthesize, toHolder: vi.fn(), speechFailed: vi.fn(), now: () => 0 })
  const state = listeningOf(session)
  state.sent('L1', HOLD)
  const after = vi.fn()
  const speech = withHeardLines(session.speechFor('t1'), 't1', state, after)
  row.text = speech.end('COMPLETED', 'I can draft one. Who is on it?').text
  speech.written('m1')
  return { session, state, recap: after.mock.calls[0]![1] as AbortSignal }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetVoiceSessions()
})

describe('a reply written whole that the person did not hear', () => {
  it('withdrawn as they went on: its message keeps none of it, the hold goes to the reply that answers again, and no recap @SC-2212 @SC-2217', async () => {
    const { session, state, recap } = writtenReply()
    expect(row.text).toBe(`${HOLD}\n\nI can draft one. Who is on it?`)
    await cancelReply(session, 'c1', 't1', -1, true)
    expect(keepHeardText).toHaveBeenCalledWith('m1', '', true)
    expect(recap.aborted).toBe(true)
    const again = withHeardLines(session.speechFor('t2'), 't2', state, vi.fn())
    expect(again.end('COMPLETED', 'Five people over seven days.').text).toBe(`${HOLD}\n\nFive people over seven days.`)
  })

  it('cut as they spoke over it: the hold stays, the reply is cut, and no recap @SC-2217', async () => {
    const { session, state, recap } = writtenReply()
    await cancelReply(session, 'c1', 't1', 0, false)
    expect(keepHeardText).toHaveBeenCalledWith('m1', `${HOLD}\n\nI can draft one.`, false)
    expect(recap.aborted).toBe(true)
    expect(state.takeLines()).toEqual([])
  })

  it('heard to its end before they spoke: nothing is cut, and its recap stays', async () => {
    const { session, recap } = writtenReply()
    await cancelReply(session, 'c1', 't1', 1, false)
    expect(keepHeardText).not.toHaveBeenCalled()
    expect(recap.aborted).toBe(false)
  })
})
