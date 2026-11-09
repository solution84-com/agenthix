// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'

const h = vi.hoisted(() => ({ emitted: [] as Array<[string, unknown]>, path: '/chat/c/c1' }))
const socket = {
  on: vi.fn(), off: vi.fn(),
  emit: (event: string, payload: unknown) => { h.emitted.push([event, payload]) },
}
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket }) }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
const getSpeechToken = vi.hoisted(() => vi.fn(async (_args?: { agentId: string }) => ({ token: 't' })))
vi.mock('wasp/client/operations', () => ({
  getSpeechToken, sendConversationMessage: vi.fn(), getUserSettings: 'getUserSettings', useQuery: () => ({ data: { adaptiveVoice: true } }),
}))
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: h.path, search: '' }) }))

import { CONVERSATION_SOCKET, CONVERSATION_VOICE_SOCKET as V } from '../../conversations/protocol'
import { VoiceCallProvider, revealLimitOf, useVoiceCall, type VoiceCallValue } from '../VoiceCallProvider'

afterEach(() => { cleanup(); h.emitted.length = 0 })

function mount() {
  const seen: { call: VoiceCallValue | null } = { call: null }
  function Probe() { seen.call = useVoiceCall(); return null }
  render(<VoiceCallProvider><Probe /></VoiceCallProvider>)
  return seen
}

describe('voice for the whole app @SC-1001', () => {
  it('is off until a conversation starts it, and starts one where the person is', () => {
    const seen = mount()
    expect(seen.call!.voice.phase).toBe('off')
    act(() => seen.call!.start('c1', { name: 'Kernel', avatarUrl: null }))
    expect(seen.call!.voice.phase).toBe('starting')
    expect(seen.call!.voice.returnTo).toBe('/chat/c/c1')
    expect(h.emitted).toContainEqual([V.start, { conversationId: 'c1' }])
  })

  it('asks for the conversation’s agent’s speech to text token', () => {
    const seen = mount()
    act(() => seen.call!.start('c1', { id: 'a1', name: 'Kernel', avatarUrl: null }))
    expect(getSpeechToken).toHaveBeenLastCalledWith({ agentId: 'a1', conversationId: 'c1', hears: ['inworld', 'assemblyai'] })
  })

  it('joins the conversation’s room, so the bar on other pages keeps hearing it', () => {
    const seen = mount()
    act(() => seen.call!.start('c1', null))
    expect(h.emitted).toContainEqual([CONVERSATION_SOCKET.subscribe, 'c1'])
  })

  it('tells hq voice ends when the tab closes', () => {
    const seen = mount()
    act(() => seen.call!.start('c1', null))
    h.emitted.length = 0
    window.dispatchEvent(new Event('pagehide'))
    expect(h.emitted).toContainEqual([V.end, { conversationId: 'c1' }])
  })

  it('ends voice on End', () => {
    const seen = mount()
    act(() => seen.call!.start('c1', null))
    act(() => seen.call!.end())
    expect(seen.call!.voice.phase).toBe('off')
  })
})

describe('how much of a reply may show @SC-995', () => {
  const sentence = { index: 0, textStart: 0, textEnd: 12, words: ['Hello', 'there'], wordStartSecs: [0, 0.5] }
  const voice = { reveal: { turnId: 't1', head: { index: 0, elapsed: 0.1, ended: false }, sentences: [sentence] } } as never

  it('is the heard part for the reply being spoken, and all of any other', () => {
    expect(revealLimitOf(voice, 't1', 'Hello there.')).toBeGreaterThan(0)
    expect(revealLimitOf(voice, 't1', 'Hello there.')).toBeLessThan(12)
    expect(revealLimitOf(voice, 't2', 'Hello there.')).toBeNull()
    expect(revealLimitOf(voice, undefined, 'Hello there.')).toBeNull()
    expect(revealLimitOf({ reveal: null } as never, 't1', 'x')).toBeNull()
  })
})
