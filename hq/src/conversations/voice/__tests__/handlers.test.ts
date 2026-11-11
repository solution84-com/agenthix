/**
 * The voice socket events from a browser: each payload is checked before it reaches the service, a refusal goes
 * back to the socket in the person's words, any other failure in general ones, and a closed tab lets voice go.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../service', () => {
  class VoiceRefused extends Error {}
  return {
    VoiceRefused,
    startVoice: vi.fn(async () => {}),
    endVoiceFrom: vi.fn(async () => {}),
    interruptVoice: vi.fn(async () => {}),
    voiceActivity: vi.fn(),
    inviteVoice: vi.fn(),
    socketGone: vi.fn(async () => {}),
  }
})

vi.mock('../continue', () => ({ continueVoice: vi.fn(async () => {}) }))

import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { registerConversationVoice } from '../handlers'
import * as service from '../service'
import { continueVoice } from '../continue'

function socket(userId: string | null = 'u1') {
  const listeners = new Map<string, (payload: unknown) => void>()
  const emitted: { event: string; payload: unknown }[] = []
  const s = {
    id: 's1',
    data: userId ? { user: { id: userId } } : {},
    emit: (event: string, payload: unknown) => { emitted.push({ event, payload }) },
    on: (event: string, listener: (payload: unknown) => void) => { listeners.set(event, listener) },
  }
  const log = { error: vi.fn() }
  registerConversationVoice(s, log)
  const fire = async (event: string, payload?: unknown) => {
    listeners.get(event)!(payload)
    await new Promise(r => setTimeout(r, 0))
  }
  return { fire, emitted, log }
}

beforeEach(() => vi.clearAllMocks())

describe('the voice socket events @SC-994', () => {
  it('start, end, interrupt and activity reach the service as the signed-in person', async () => {
    const { fire } = socket()
    await fire(V.start, { conversationId: 'c1' })
    await fire(V.end, { conversationId: 'c1', failed: 'speech-to-text' })
    await fire(V.interrupt, { conversationId: 'c1', turnId: 't1', heardThrough: 2 })
    await fire(V.activity, { conversationId: 'c1' })
    expect(service.startVoice).toHaveBeenCalledWith('s1', 'u1', 'c1')
    expect(service.endVoiceFrom).toHaveBeenCalledWith('s1', 'u1', 'c1', true)
    expect(service.interruptVoice).toHaveBeenCalledWith('s1', 'u1', 'c1', 't1', 2, 0)
    expect(service.voiceActivity).toHaveBeenCalledWith('s1', 'u1', 'c1')
  })

  it('an interruption carries the words heard of the next sentence, when the browser sends them @SC-997 @SC-1922', async () => {
    const { fire } = socket()
    await fire(V.interrupt, { conversationId: 'c1', turnId: 't1', heardThrough: 0, heardWords: 4 })
    await fire(V.interrupt, { conversationId: 'c1', turnId: 't2', heardThrough: 0, heardWords: 'many' })
    expect(service.interruptVoice).toHaveBeenCalledWith('s1', 'u1', 'c1', 't1', 0, 4)
    expect(service.interruptVoice).toHaveBeenCalledWith('s1', 'u1', 'c1', 't2', 0, 0)
  })

  it('an invitation and words that continue a message reach the service', async () => {
    const { fire } = socket()
    await fire(V.invite, { conversationId: 'c1', updateId: 'card-1' })
    await fire(V.continue, { conversationId: 'c1', turnId: 't1', text: 'and the tests' })
    expect(service.inviteVoice).toHaveBeenCalledWith('s1', 'u1', 'c1', 'card-1')
    expect(continueVoice).toHaveBeenCalledWith('s1', 'u1', 'c1', 't1', 'and the tests', false)
    await fire(V.continue, { conversationId: 'c1', turnId: 't1', text: 'I think we', trailedOff: true })
    expect(continueVoice).toHaveBeenLastCalledWith('s1', 'u1', 'c1', 't1', 'I think we', true)
  })

  it('ignores an invitation or a continuation that is malformed', async () => {
    const { fire } = socket()
    await fire(V.invite, { conversationId: 'c1' })
    await fire(V.continue, { conversationId: 'c1', turnId: 't1' })
    await fire(V.continue, { conversationId: 'c1', text: 'more' })
    await fire(V.continue, { conversationId: 'c1', turnId: 't1', text: 'x'.repeat(32_001) })
    expect(service.inviteVoice).not.toHaveBeenCalled()
    expect(continueVoice).not.toHaveBeenCalled()
  })

  it('ignores a malformed payload, or a socket with no person', async () => {
    const { fire } = socket()
    await fire(V.start, 'c1')
    await fire(V.start, { conversationId: 'x'.repeat(201) })
    await fire(V.interrupt, { conversationId: 'c1', turnId: 't1', heardThrough: 'all' })
    await socket(null).fire(V.start, { conversationId: 'c1' })
    expect(service.startVoice).not.toHaveBeenCalled()
    expect(service.interruptVoice).not.toHaveBeenCalled()
  })

  it('sends a refusal back in its own words, and any other failure in general ones', async () => {
    const { fire, emitted, log } = socket()
    vi.mocked(service.startVoice).mockRejectedValueOnce(new service.VoiceRefused('Ana is using voice in this conversation.'))
    await fire(V.start, { conversationId: 'c1' })
    vi.mocked(service.startVoice).mockRejectedValueOnce(new Error('database down'))
    await fire(V.start, { conversationId: 'c1' })
    expect(emitted).toEqual([
      { event: V.error, payload: { conversationId: 'c1', message: 'Ana is using voice in this conversation.' } },
      { event: V.error, payload: { conversationId: 'c1', message: 'Voice could not do that just now. Try again.' } },
    ])
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('a closed tab lets go of its voice', async () => {
    const { fire } = socket()
    await fire('disconnect')
    expect(service.socketGone).toHaveBeenCalledWith('s1')
  })
})
