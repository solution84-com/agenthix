/**
 * Starting voice, and a voice turn's sentences, call no text to speech or speech to text adapter in demo mode (S2):
 * the demo voice plays recorded clips only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ tts: vi.fn(), phrases: vi.fn(), agentVoice: vi.fn() }))
vi.mock('../../../voice/inworldAdapter', () => ({
  inworldTtsAdapter: {
    synthesize: h.tts, listVoices: h.tts,
    synthesizeStream: (...args: unknown[]) => { h.tts(...args); return (async function* () { /* none */ })() },
  },
}))
vi.mock('../phrases', () => ({ phraseClips: h.phrases, spokenAs: vi.fn() }))
vi.mock('../../readingRule', () => ({ requireConversationSpeaker: vi.fn(async () => ({ id: 'c1', agentId: 'a1' })) }))

import { setDemoModeForTests } from '../../../demo/demoMode'
import { startVoice, VoiceRefused } from '../service'

beforeEach(() => vi.clearAllMocks())
afterEach(() => setDemoModeForTests(null))

describe('starting voice in demo mode @SC-1965', () => {
  it('is refused before any speech adapter or phrase clip is reached', async () => {
    setDemoModeForTests(true)
    await expect(startVoice('s1', 'u1', 'c1')).rejects.toBeInstanceOf(VoiceRefused)
    expect(h.tts).not.toHaveBeenCalled()
    expect(h.phrases).not.toHaveBeenCalled()
  })
})
