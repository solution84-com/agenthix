import { describe, it, expect, vi, beforeEach } from 'vitest'
import { INWORLD_TTS_URL, INWORLD_VOICES_URL } from '../inworldAdapter'

vi.mock('ws')

const { mockStreamWithTimestamps } = vi.hoisted(() => ({
  mockStreamWithTimestamps: vi.fn(),
}))
vi.mock('@inworld/tts', () => ({
  InworldTTS: () => ({ streamWithTimestamps: mockStreamWithTimestamps }),
}))

describe('InworldTtsAdapter @SC-129', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('synthesize', () => {
    it('POSTs to Inworld TTS endpoint and decodes base64 audioContent into a Buffer', async () => {
      const fakeAudioContent = Buffer.from('fake-pcm-data').toString('base64')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ audioContent: fakeAudioContent }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const adapter = new InworldTtsAdapter()
      const result = await adapter.synthesize('Hello world', {
        apiKey: 'test-key',
        voiceId: 'Ashley',
        model: 'inworld-tts-2',
      })

      expect(fetchMock).toHaveBeenCalledWith(
        INWORLD_TTS_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Basic test-key',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            text: 'Hello world',
            voice_id: 'Ashley',
            model_id: 'inworld-tts-2',
            audio_config: { audio_encoding: 'LINEAR16', sample_rate_hertz: 24000 },
          }),
        }),
      )
      expect(result).toBeInstanceOf(Buffer)
      expect(result.toString()).toBe('fake-pcm-data')
    })

    it('throws when TTS request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 401, statusText: 'Unauthorized',
        text: async () => '',
      }))
      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const adapter = new InworldTtsAdapter()
      await expect(
        adapter.synthesize('Hello', { apiKey: 'bad-key', voiceId: 'Ashley', model: 'inworld-tts-2' }),
      ).rejects.toThrow('Inworld TTS failed: 401 Unauthorized')
    })
  })

  describe('synthesizeStream', () => {
    beforeEach(() => mockStreamWithTimestamps.mockReset())

    it('yields { audio, wordTiming } from SDK streamWithTimestamps', async () => {
      async function* fakeStream() {
        yield { audio: new Uint8Array(Buffer.from('pcm-chunk-1')), timestamps: undefined }
        yield {
          audio: new Uint8Array(Buffer.from('pcm-chunk-2')),
          timestamps: {
            wordAlignment: {
              words: ['Hello', '.'],
              wordStartTimeSeconds: [0, 0.3],
              wordEndTimeSeconds: [0.3, 0.4],
              phoneticDetails: [],
            },
          },
        }
      }
      mockStreamWithTimestamps.mockReturnValue(fakeStream())

      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const adapter = new InworldTtsAdapter()
      const results: Array<{ audio: Buffer; wordTiming?: any }> = []
      for await (const item of adapter.synthesizeStream('Hello.', {
        apiKey: 'test-key', voiceId: 'Ashley', model: 'inworld-tts-2',
      })) {
        results.push(item)
      }

      expect(mockStreamWithTimestamps).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Hello.',
        voice: 'Ashley',
        model: 'inworld-tts-2',
        encoding: 'PCM',
        sampleRate: 24000,
        timestampType: 'WORD',
      }))
      expect(results).toHaveLength(2)
      expect(results[0].audio.toString()).toBe('pcm-chunk-1')
      expect(results[0].wordTiming).toBeUndefined()
      expect(results[1].audio.toString()).toBe('pcm-chunk-2')
      expect(results[1].wordTiming).toEqual({
        words: ['Hello', '.'],
        wordStartSecs: [0, 0.3],
        wordEndSecs: [0.3, 0.4],
      })
    })

    it('stops yielding when signal is aborted', async () => {
      const ac = new AbortController()
      async function* fakeStream() {
        yield { audio: new Uint8Array(Buffer.from('chunk')), timestamps: undefined }
        ac.abort()
        yield { audio: new Uint8Array(Buffer.from('should-not-yield')), timestamps: undefined }
      }
      mockStreamWithTimestamps.mockReturnValue(fakeStream())

      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const adapter = new InworldTtsAdapter()
      const results: any[] = []
      for await (const item of adapter.synthesizeStream('Hi.', {
        apiKey: 'key', voiceId: 'Ashley', model: 'inworld-tts-2',
      }, ac.signal)) {
        results.push(item)
      }
      expect(results).toHaveLength(1)
    })
  })

  describe('listVoices', () => {
    it('pages through the Voice API and keeps the fields the filters use', async () => {
      const first = {
        voices: [{
          voiceId: 'Clive', displayName: 'Clive', description: 'British male', languageCode: 'en-GB', gender: 'male',
          ageGroup: 'middle_aged', categories: ['companions'], tags: ['calm'], source: 'SYSTEM',
        }],
        nextPageToken: 'page-2',
      }
      const second = {
        voices: [
          { voiceId: 'ws__mine', displayName: 'Mine', languageCode: 'es-MX', gender: '', ageGroup: '', categories: [], tags: [], source: 'IVC' },
          { voiceId: 'Clive', displayName: 'Clive', source: 'SYSTEM' },
        ],
        nextPageToken: '',
      }
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => first })
        .mockResolvedValueOnce({ ok: true, json: async () => second })
      vi.stubGlobal('fetch', fetchMock)

      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const voices = await new InworldTtsAdapter().listVoices('test-key')

      expect(INWORLD_VOICES_URL).toBe('https://api.inworld.ai/voices/v1/voices')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0][0]).toBe(`${INWORLD_VOICES_URL}?pageSize=500`)
      expect(fetchMock.mock.calls[1][0]).toBe(`${INWORLD_VOICES_URL}?pageSize=500&pageToken=page-2`)
      expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Basic test-key' } })
      expect(voices).toEqual([
        {
          voiceId: 'Clive', displayName: 'Clive', description: '', languageCode: '', accent: '', gender: '', ageGroup: '',
          categories: [], tags: [], source: 'SYSTEM', isCustom: false,
        },
        {
          voiceId: 'ws__mine', displayName: 'Mine', description: '', languageCode: 'es-MX', accent: 'Mexican', gender: '', ageGroup: '',
          categories: [], tags: [], source: 'IVC', isCustom: true,
        },
      ])
    })

    it('reads the accent from the region of the language code', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ voices: [
        { voiceId: 'a', languageCode: 'en-GB', source: 'SYSTEM' }, { voiceId: 'b', languageCode: 'en-XX', source: 'SYSTEM' }, { voiceId: 'c', languageCode: 'vi', source: 'SYSTEM' },
      ] }) })
      vi.stubGlobal('fetch', fetchMock)
      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const voices = await new InworldTtsAdapter().listVoices('k')
      expect(voices.map(v => v.accent)).toEqual(['British', 'XX', ''])
    })

    it('throws when listVoices request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }))
      const { InworldTtsAdapter } = await import('../inworldAdapter')
      const adapter = new InworldTtsAdapter()
      await expect(adapter.listVoices('bad-key')).rejects.toThrow('Inworld listVoices failed: 403 Forbidden')
    })
  })
})
