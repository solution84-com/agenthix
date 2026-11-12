/**
 * Voice over hq's socket is inert in demo mode (live demo spec, *Voice is in, as a demo voice*; S2): no event reaches
 * the voice service, which would take voice and speak through a vendor; reading an answer aloud is not offered. With
 * the setting off the events reach the service as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../service', () => {
  class VoiceRefused extends Error {}
  return {
    VoiceRefused,
    startVoice: vi.fn(async () => {}), endVoiceFrom: vi.fn(async () => {}), interruptVoice: vi.fn(async () => {}),
    voiceActivity: vi.fn(), inviteVoice: vi.fn(), socketGone: vi.fn(async () => {}),
  }
})
vi.mock('../continue', () => ({ continueVoice: vi.fn(async () => {}) }))

import { CONVERSATION_VOICE_SOCKET as V } from '../../../shared/conversations/voice'
import { setDemoModeForTests } from '../../../demo/demoMode'
import { registerConversationVoice } from '../handlers'
import { continueVoice } from '../continue'
import { createListen, type ListenDeps } from '../listen'
import * as service from '../service'

function socket() {
  const listeners = new Map<string, (payload: unknown) => void>()
  const emitted: { event: string; payload: unknown }[] = []
  registerConversationVoice({
    id: 's1', data: { user: { id: 'u1' } },
    emit: (event, payload) => { emitted.push({ event, payload }) },
    on: (event, listener) => { listeners.set(event, listener) },
  }, { error: vi.fn() })
  const fire = async (event: string, payload?: unknown) => {
    listeners.get(event)?.(payload)
    await new Promise(r => setTimeout(r, 0))
  }
  return { fire, emitted }
}

const EVENTS: [string, unknown][] = [
  [V.start, { conversationId: 'c1' }], [V.end, { conversationId: 'c1' }],
  [V.interrupt, { conversationId: 'c1', turnId: 't1', heardThrough: 1 }], [V.activity, { conversationId: 'c1' }],
  [V.invite, { conversationId: 'c1', updateId: 'u' }], [V.continue, { conversationId: 'c1', turnId: 't1', text: 'hi' }],
]

beforeEach(() => vi.clearAllMocks())
afterEach(() => setDemoModeForTests(null))

describe('voice over the socket in demo mode @SC-1965', () => {
  it('no event reaches the voice service', async () => {
    setDemoModeForTests(true)
    const { fire, emitted } = socket()
    for (const [event, payload] of EVENTS) await fire(event, payload)
    expect(service.startVoice).not.toHaveBeenCalled()
    expect(service.endVoiceFrom).not.toHaveBeenCalled()
    expect(service.interruptVoice).not.toHaveBeenCalled()
    expect(service.voiceActivity).not.toHaveBeenCalled()
    expect(service.inviteVoice).not.toHaveBeenCalled()
    expect(continueVoice).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('with the setting off every event reaches the service @SC-1979', async () => {
    setDemoModeForTests(false)
    const { fire } = socket()
    for (const [event, payload] of EVENTS) await fire(event, payload)
    expect(service.startVoice).toHaveBeenCalledTimes(1)
    expect(service.endVoiceFrom).toHaveBeenCalledTimes(1)
    expect(service.interruptVoice).toHaveBeenCalledTimes(1)
    expect(service.voiceActivity).toHaveBeenCalledTimes(1)
    expect(service.inviteVoice).toHaveBeenCalledTimes(1)
    expect(continueVoice).toHaveBeenCalledTimes(1)
  })
})

describe('reading an answer aloud in demo mode @SC-1965', () => {
  const ref = { id: 'c1', home: 'PERSON' as const, projectId: null, taskId: null, openedById: 'u1', agentId: 'a1' }
  const deps = (): ListenDeps => ({
    reader: vi.fn(async () => ref),
    answer: vi.fn(async () => ({ text: 'Two links are broken.', agentId: 'a1' })),
    voice: vi.fn(async () => ({ voice: { apiKey: 'k', voiceId: 'v', model: 'm', providerId: 'p1' } })),
    synthesize: vi.fn(async () => Buffer.from('x')), spent: vi.fn(), failed: vi.fn(),
  })

  it('is not offered, and synthesises nothing', async () => {
    setDemoModeForTests(true)
    const d = deps()
    const listen = createListen(d)
    expect(await listen.available('c1', 'u1')).toEqual({ available: false })
    await expect(listen.speak({ conversationId: 'c1', messageId: 'm1', part: 0 }, 'u1')).rejects.toMatchObject({ statusCode: 403 })
    expect(d.synthesize).not.toHaveBeenCalled()
  })

  it('is offered as before with the setting off @SC-1979', async () => {
    setDemoModeForTests(false)
    expect(await createListen(deps()).available('c1', 'u1')).toEqual({ available: true })
  })
})
