/**
 * The voice socket events from a browser: each payload is checked before it reaches the service, a refusal goes
 * back to the socket in the person's words, any other failure in general ones, and a closed tab lets voice go.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERSATION_VOICE_PAGE_SOCKET as VP } from '@agenthix/core'

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
    heldBy: vi.fn((_s: string, _u: string, conversationId: string) => (conversationId === 'c1' ? { conversationId } : undefined)),
    heldBySpeaker: vi.fn(async () => undefined),
  }
})

vi.mock('../listening', () => ({
  listening: { listen: vi.fn(async () => {}), played: vi.fn() },
  unheard: { skipped: vi.fn(async () => {}) },
}))

vi.mock('../continue', () => ({ continueVoice: vi.fn(async () => {}) }))

vi.mock('../humService', () => ({ humService: { ask: vi.fn(async () => {}), speak: vi.fn(async () => {}) } }))

import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { registerConversationVoice } from '../handlers'
import * as service from '../service'
import { continueVoice } from '../continue'
import { listening, unheard } from '../listening'
import { humService } from '../humService'

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

  it('starts voice for an app (a socket that stated its client protocol) as for a page: no backchannel library any more', async () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    registerConversationVoice({ id: 's2', data: { user: { id: 'u1' }, client: { version: '1.1', userAgent: null } }, emit: () => {}, on: (e, l) => { listeners.set(e, l) } }, { error: vi.fn() })
    listeners.get(V.start)!({ conversationId: 'c1' })
    await new Promise(r => setTimeout(r, 0))
    expect(service.startVoice).toHaveBeenCalledWith('s2', 'u1', 'c1')
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

  it('a line played reaches listening, and one the browser skipped is taken out of what was heard', async () => {
    const { fire } = socket()
    await fire(V.linePlayed, { conversationId: 'c1', lineId: 'L1' })
    await fire(V.linePlayed, { conversationId: 'c1', lineId: 'L2', skipped: true })
    await fire(V.linePlayed, { conversationId: 'c1', lineId: 'L3', skipped: 'yes' })
    await fire(V.linePlayed, { conversationId: 'c2', lineId: 'L4', skipped: true })
    expect(vi.mocked(listening.played).mock.calls.map(c => c[1])).toEqual(['L1', 'L3'])
    expect(vi.mocked(unheard.skipped).mock.calls.map(c => c[1])).toEqual(['L2'])
  })

  it('a closed tab lets go of its voice', async () => {
    const { fire } = socket()
    await fire('disconnect')
    expect(service.socketGone).toHaveBeenCalledWith('s1')
  })
})

describe('the hum service\'s question @SC-2228', () => {
  it('reaches the hum service for the holder, with its seq and words', async () => {
    const { fire } = socket()
    await fire(VP.backchannel, { conversationId: 'c1', seq: 4, text: 'my friend twisted her ankle' })
    expect(humService.ask).toHaveBeenCalledWith({ conversationId: 'c1' }, { seq: 4, text: 'my friend twisted her ankle' })
  })

  it('carries the mark of a question asked as a pause began, and nothing but true', async () => {
    const { fire } = socket()
    await fire(VP.backchannel, { conversationId: 'c1', seq: 5, text: 'about 6 in the morning', atPause: true })
    await fire(VP.backchannel, { conversationId: 'c1', seq: 6, text: 'the first hour', atPause: 'yes' })
    expect(humService.ask).toHaveBeenNthCalledWith(1, { conversationId: 'c1' }, { seq: 5, text: 'about 6 in the morning', atPause: true })
    expect(humService.ask).toHaveBeenNthCalledWith(2, { conversationId: 'c1' }, { seq: 6, text: 'the first hour' })
  })

  it('is dropped when malformed, empty, too long, or not from the holder', async () => {
    const { fire } = socket()
    await fire(VP.backchannel, { conversationId: 'c1', seq: 1.5, text: 'x' })
    await fire(VP.backchannel, { conversationId: 'c1', seq: 1, text: '  ' })
    await fire(VP.backchannel, { conversationId: 'c1', seq: 1, text: 'x'.repeat(100_000) })
    await fire(VP.backchannel, { conversationId: 'c2', seq: 1, text: 'hello' })
    expect(humService.ask).not.toHaveBeenCalled()
  })

  it('carries the last three sounds, each short, and nothing else', async () => {
    const { fire } = socket()
    await fire(VP.backchannel, { conversationId: 'c1', seq: 7, text: 'and then', recent: ['Mm.', 3, 'x'.repeat(41), 'Right.', 'Oh.', 'Okay.'] })
    await fire(VP.backchannel, { conversationId: 'c1', seq: 8, text: 'and then', recent: 'Mm.' })
    expect(humService.ask).toHaveBeenNthCalledWith(1, { conversationId: 'c1' }, { seq: 7, text: 'and then', recent: ['Right.', 'Oh.', 'Okay.'] })
    expect(humService.ask).toHaveBeenNthCalledWith(2, { conversationId: 'c1' }, { seq: 8, text: 'and then' })
  })
})

describe('the sound keeper\'s request @SC-2228 @SC-2237', () => {
  it('names a kind of the hum library and a tone it takes; never words; and only from the holder', async () => {
    const { fire } = socket()
    await fire(VP.backchannelSpeak, { conversationId: 'c1', kind: 'sympathy', tone: 'gentle', words: 'Say anything' })
    await fire(VP.backchannelSpeak, { conversationId: 'c1', kind: 'continuer', tone: 'calm', warm: true })
    await fire(VP.backchannelSpeak, { conversationId: 'c1', kind: 'sympathy', tone: 'bright' })
    await fire(VP.backchannelSpeak, { conversationId: 'c1', kind: 'none', tone: 'calm' })
    await fire(VP.backchannelSpeak, { conversationId: 'c1', seq: 4 })
    await fire(VP.backchannelSpeak, { conversationId: 'c2', kind: 'sympathy', tone: 'gentle' })
    expect(vi.mocked(humService.speak).mock.calls).toEqual([
      [{ conversationId: 'c1' }, { kind: 'sympathy', tone: 'gentle' }], [{ conversationId: 'c1' }, { kind: 'continuer', tone: 'calm', warm: true }],
    ])
})
})
