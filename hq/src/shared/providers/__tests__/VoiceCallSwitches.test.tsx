// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const h = vi.hoisted(() => ({ off: { phase: 'off' }, socket: { on: () => undefined, off: () => undefined, emit: () => undefined }, settings: {} as Record<string, boolean>, deps: null as null | Record<string, () => boolean> }))
vi.mock('wasp/client/webSocket', () => ({ useSocket: () => ({ socket: h.socket }) }))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('wasp/client/operations', () => ({
  getSpeechToken: vi.fn(), sendConversationMessage: vi.fn(), getUserSettings: 'getUserSettings', getFeatures: 'getFeatures', getDemoInfo: 'getDemoInfo',
  useQuery: (q: string) => ({ data: q === 'getUserSettings' ? h.settings : undefined }),
}))
vi.mock('react-router', () => ({ useLocation: () => ({ pathname: '/', search: '' }) }))
vi.mock('../../../conversations/voiceClient/voiceSession', () => ({
  createVoiceSession: (deps: Record<string, () => boolean>) => {
    h.deps = deps
    return { subscribe: () => () => undefined, snapshot: () => h.off, dispose: () => undefined, closing: () => undefined }
  },
}))

import { VoiceCallProvider } from '../VoiceCallProvider'

afterEach(() => { cleanup(); h.deps = null })

describe('the voice call reads the Hums and Expressive tone switches @SC-2241', () => {
  it('hands them to the session as the person set them', () => {
    h.settings = { voiceHums: false, voiceExpressiveTone: false }
    render(<VoiceCallProvider><span /></VoiceCallProvider>)
    expect(h.deps!.voiceHums()).toBe(false)
    expect(h.deps!.voiceExpressiveTone()).toBe(false)
  })

  it('both are on until the person turns them off', () => {
    h.settings = {}
    render(<VoiceCallProvider><span /></VoiceCallProvider>)
    expect(h.deps!.voiceHums()).toBe(true)
    expect(h.deps!.voiceExpressiveTone()).toBe(true)
  })
})
