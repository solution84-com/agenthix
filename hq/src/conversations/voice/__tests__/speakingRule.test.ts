/**
 * Voice keeps to the speaking rule for as long as it is held, not only when it is taken: every action that writes
 * or steers checks it again, and a holder who may no longer speak where they hold voice loses it — at the action,
 * or at once when a change in access is reported (`endVoiceNoLongerAllowed`). The rule itself, and its wording,
 * against the real database: lossOfAccess.integration.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => {
  class HttpError extends Error {
    constructor(readonly statusCode: number, message?: string) { super(message) }
  }
  return { HttpError, prisma: { conversation: { findUnique: vi.fn(async () => null) }, conversationMessage: { findFirst: vi.fn(async () => null) } } }
})
vi.mock('../../readingRule', () => ({ requireConversationSpeaker: vi.fn() }))
vi.mock('../holder', () => ({ releaseVoice: vi.fn(async () => null), takeVoice: vi.fn(), clearVoiceHolders: vi.fn(async () => []) }))
vi.mock('../speech', () => ({ toRoom: vi.fn(), toSockets: vi.fn(), sessionDeps: vi.fn(), agentVoice: vi.fn() }))
vi.mock('../../coordinator/scheduler', () => ({ scheduleConversation: vi.fn(), stopRunningTurn: vi.fn() }))
vi.mock('../../coordinator/liveTurns', () => ({ liveTurn: vi.fn(() => ({ turnId: 't1' })), stopLive: vi.fn() }))
vi.mock('../../coordinator/events', () => ({ conversationEvents: { message: vi.fn(), messageUpdated: vi.fn() } }))
vi.mock('../../coordinator/turnRecord', () => ({ requestStop: vi.fn() }))
vi.mock('../../coordinator/admission', () => ({ admitMessage: vi.fn() }))
vi.mock('../../store/messages', () => ({
  keepHeardText: vi.fn(), toMessageView: vi.fn(), updateMessage: vi.fn(),
  readEncouragement: vi.fn(async () => null), joinSpokenWords: vi.fn(async () => null),
}))
vi.mock('../../conversationQueries', () => ({ accessState: vi.fn() }))
vi.mock('../../../voice/speechScope', () => ({ scopeOfConversation: vi.fn() }))
vi.mock('../phrases', () => ({ phraseClips: vi.fn() }))
vi.mock('../availability', () => ({ loadVoiceFacts: vi.fn(), inUse: vi.fn(), voiceRefusal: vi.fn(), voiceStartedAt: vi.fn() }))
vi.mock('../../../sessions/transcriptAuthors', () => ({ personName: vi.fn() }))

import { HttpError } from 'wasp/server'
import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { requireConversationSpeaker } from '../../readingRule'
import { releaseVoice } from '../holder'
import { toSockets } from '../speech'
import { scheduleConversation } from '../../coordinator/scheduler'
import { stopLive } from '../../coordinator/liveTurns'
import { admitMessage } from '../../coordinator/admission'
import { joinSpokenWords } from '../../store/messages'
import { openVoiceSession, resetVoiceSessions, voiceSession } from '../registry'
import type { VoiceSessionDeps } from '../session'
import { ENDED, endVoiceNoLongerAllowed, interruptVoice, inviteVoice, VoiceRefused } from '../service'
import { continueVoice } from '../continue'

const VIEWER = "Talking to this project's agents needs the Member or Admin role in it."

function deps(): VoiceSessionDeps {
  // eslint-disable-next-line require-yield
  async function* synthesize() { return }
  return { synthesize, toHolder: vi.fn(), speechFailed: vi.fn(), now: () => 0 }
}

function hold(conversationId: string, holderId: string, socketId = 's1') {
  return openVoiceSession(conversationId, holderId, socketId, deps())
}

/** Who may speak where: `refused` answers 409 with the Viewer refusal, `gone` 404, `down` a database failure. */
function rule(by: Record<string, 'ok' | 'refused' | 'gone' | 'down'>) {
  vi.mocked(requireConversationSpeaker).mockImplementation(async (conversationId: string, userId: string) => {
    const answer = by[`${conversationId}/${userId}`] ?? 'ok'
    if (answer === 'refused') throw new HttpError(409, VIEWER)
    if (answer === 'gone') throw new HttpError(404, 'Conversation not found')
    if (answer === 'down') throw new Error('database down')
    return { id: conversationId } as Awaited<ReturnType<typeof requireConversationSpeaker>>
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetVoiceSessions()
})

describe('every voice action that writes or steers checks the speaking rule again', () => {
  it('a holder made a Viewer cannot stop a reply by speaking over it: voice ends and they are told why', async () => {
    hold('c1', 'u1')
    rule({ 'c1/u1': 'refused' })
    await expect(interruptVoice('s1', 'u1', 'c1', 't1', 2)).rejects.toThrow(new VoiceRefused(`${VIEWER} Voice ended. Nothing was changed.`))
    expect(stopLive).not.toHaveBeenCalled()
    expect(voiceSession('c1')).toBeUndefined()
    expect(releaseVoice).toHaveBeenCalledWith('c1', 'u1', ENDED.noLongerAllowedRecord)
    expect(toSockets).toHaveBeenCalledWith(new Set(['s1']), V.ended, { conversationId: 'c1', reason: ENDED.noLongerAllowed })
  })

  it('a holder who may still speak stops the reply as before', async () => {
    hold('c1', 'u1').speechFor('t1')
    rule({})
    await interruptVoice('s1', 'u1', 'c1', 't1', 2)
    expect(stopLive).toHaveBeenCalledWith('c1', 'interrupt')
    expect(voiceSession('c1')).toBeDefined()
  })

  it('a holder removed from the project cannot add spoken words to their message or ask for a reply', async () => {
    hold('c1', 'u1')
    rule({ 'c1/u1': 'gone' })
    await expect(continueVoice('s1', 'u1', 'c1', 't1', 'and deploy it')).rejects.toThrow(
      'You can no longer speak in this conversation. Voice ended. Nothing was changed.',
    )
    expect(joinSpokenWords).not.toHaveBeenCalled()
    expect(admitMessage).not.toHaveBeenCalled()
    expect(scheduleConversation).toHaveBeenCalledTimes(1) // the end of voice, letting a waiting update go as text
    expect(voiceSession('c1')).toBeUndefined()
  })

  it('a holder who may no longer speak cannot invite the agent\'s raised hand', async () => {
    const session = hold('c1', 'u1')
    const invite = vi.spyOn(session.hand, 'invite').mockReturnValue(true)
    rule({ 'c1/u1': 'refused' })
    await expect(inviteVoice('s1', 'u1', 'c1', 'card-1')).rejects.toBeInstanceOf(VoiceRefused)
    expect(invite).not.toHaveBeenCalled()
  })

  it('a socket that does not hold voice is ignored without a check', async () => {
    hold('c1', 'u1')
    await interruptVoice('s2', 'u1', 'c1', 't1', 2)
    await continueVoice('s1', 'u2', 'c1', 't1', 'words')
    expect(requireConversationSpeaker).not.toHaveBeenCalled()
  })
})

describe('a change in access ends voice held by someone who may no longer speak there', () => {
  it('ends only the voice whose holder is refused, and leaves one whose check could not answer', async () => {
    hold('c1', 'u1', 's1')
    hold('c2', 'u2', 's2')
    hold('c3', 'u3', 's3')
    rule({ 'c1/u1': 'refused', 'c3/u3': 'down' })
    await endVoiceNoLongerAllowed()
    expect(voiceSession('c1')).toBeUndefined()
    expect(voiceSession('c2')).toBeDefined()
    expect(voiceSession('c3')).toBeDefined()
    expect(releaseVoice).toHaveBeenCalledExactlyOnceWith('c1', 'u1', ENDED.noLongerAllowedRecord)
  })

  it('with people named, checks only their voice', async () => {
    hold('c1', 'u1', 's1')
    hold('c2', 'u2', 's2')
    rule({ 'c1/u1': 'refused', 'c2/u2': 'gone' })
    await endVoiceNoLongerAllowed(['u2'])
    expect(voiceSession('c1')).toBeDefined()
    expect(voiceSession('c2')).toBeUndefined()
  })
})
