import { afterEach, describe, expect, it, vi } from 'vitest'
import { inworldHearing, readInworldMessage, transcribeConfig } from '../../adapters/inworldHearing'
import type { SpeechToTextHandlers } from '../../ports'
import { speechService } from '../../stt'
import { meteredService } from '../../stt/meter'
import { VOICE_SETTINGS } from '../../settings'
import { profileWords, readVoiceProfile } from '../voiceProfile'

const frame = (transcription: Record<string, unknown>) => JSON.stringify({ result: { transcription } })

const PROFILE = {
  emotion: [{ label: 'neutral', confidence: 0.2 }, { label: 'happy', confidence: 0.71 }],
  vocalStyle: [{ label: 'laughing', confidence: 0.83 }],
  age: [{ label: 'adult', confidence: 0.9 }],
}

class FakeSocket {
  static OPEN = 1
  static last: FakeSocket | null = null
  readyState = 0
  bufferedAmount = 0
  binaryType = 'blob'
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  constructor(public url: string) { FakeSocket.last = this }
  send(data: unknown) { this.sent.push(data) }
  close() { this.readyState = 3 }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('the voice profile @SC-2233', () => {
  it('reads emotion and vocal style, most confident first, in camelCase or snake_case; nothing else', () => {
    expect(readVoiceProfile({ voiceProfile: PROFILE })).toEqual({
      emotion: [{ label: 'happy', confidence: 0.71 }, { label: 'neutral', confidence: 0.2 }],
      style: [{ label: 'laughing', confidence: 0.83 }],
    })
    expect(readVoiceProfile({ voice_profile: { vocal_style: [{ label: 'Crying', confidence: 0.7 }] } }))
      .toEqual({ emotion: [], style: [{ label: 'crying', confidence: 0.7 }] })
    expect(readVoiceProfile({ voiceProfile: { age: PROFILE.age } })).toBeNull()
    expect(readVoiceProfile({ transcript: 'hi' })).toBeNull()
    expect(readVoiceProfile({ voiceProfile: { emotion: [{ label: 'happy' }, { confidence: 1 }, 'x'] } })).toBeNull()
  })

  it('says a reading as the Log shows it: each category\'s top label', () => {
    expect(profileWords(readVoiceProfile({ voiceProfile: PROFILE })!)).toBe('happy 0.71 · laughing 0.83')
  })

  it('rides on a transcript frame, final or not, and an empty one', () => {
    expect(readInworldMessage(frame({ transcript: 'ha', isFinal: false, voiceProfile: PROFILE }))).toMatchObject({
      kind: 'words', final: false, profile: { emotion: [{ label: 'happy' }, { label: 'neutral' }] },
    })
    expect(readInworldMessage(frame({ transcript: 'ok' }))).not.toHaveProperty('profile')
  })

  it('is asked for only when the adapter is told to: dictation and the default config are unchanged', () => {
    expect(transcribeConfig({}).transcribeConfig).not.toHaveProperty('voiceProfileConfig')
    expect(transcribeConfig({}, true).transcribeConfig).toMatchObject({ voiceProfileConfig: { enableVoiceProfile: true, topN: 3 } })
  })

  it('voice asks for it with the light model listening and its switch on, read as each connection opens, metered or not', () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const LISTENING = { ...VOICE_SETTINGS, voiceListener: true }
    const metered = meteredService(speechService, vi.fn())
    const sentConfig = (settings: typeof VOICE_SETTINGS, service = speechService) => {
      void service({ token: 't', provider: 'inworld' }, settings).connect({ onWords: vi.fn(), onClose: vi.fn(), onError: vi.fn() })
      const socket = FakeSocket.last!
      socket.readyState = 1
      socket.onopen?.()
      return JSON.parse(socket.sent[0] as string).transcribeConfig
    }
    expect(sentConfig(LISTENING)).toHaveProperty('voiceProfileConfig')
    expect(sentConfig(LISTENING, metered)).toHaveProperty('voiceProfileConfig')
    expect(sentConfig({ ...LISTENING, tone: { ...LISTENING.tone, on: false } })).not.toHaveProperty('voiceProfileConfig')
    expect(sentConfig({ ...LISTENING, adaptiveVoice: false })).not.toHaveProperty('voiceProfileConfig')
    // The flag off is today's voice: nothing asked.
    expect(sentConfig(VOICE_SETTINGS)).not.toHaveProperty('voiceProfileConfig')
  })

  it('the adapter hands each reading on before its words, even on an empty partial the words skip', async () => {
    vi.stubGlobal('WebSocket', FakeSocket)
    const order: string[] = []
    const h = {
      onWords: vi.fn(() => { order.push('words') }), onClose: vi.fn(), onError: vi.fn(),
      onVoiceProfile: vi.fn((_p: unknown, final: boolean) => { order.push(final ? 'profile final' : 'profile') }),
    } satisfies SpeechToTextHandlers
    const connecting = inworldHearing({ token: 't', voiceProfile: true }).connect(h)
    const socket = FakeSocket.last!
    socket.readyState = 1
    socket.onopen?.()
    await connecting
    socket.onmessage?.({ data: frame({ transcript: '', isFinal: false, voiceProfile: PROFILE }) })
    socket.onmessage?.({ data: frame({ transcript: 'ha ha', isFinal: true, voiceProfile: PROFILE }) })
    expect(order).toEqual(['profile', 'profile final', 'words'])
    expect(h.onVoiceProfile.mock.calls[0]![0]).toMatchObject({ style: [{ label: 'laughing', confidence: 0.83 }] })
  })
})
