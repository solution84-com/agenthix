import { InworldTTS } from '@inworld/tts'
import type { TtsAdapter, TTSConfig, Voice, WordTiming } from './ttsAdapter'
import { accentOf } from './voiceAccent'
import { Logger } from '../server/utils/logger'
import { PROVIDER_CALL_TIMEOUT_MS } from './providerTimeout'
import { refuseVoiceVendorInDemo } from './demoNoVendor'

const logger = new Logger('Voice')

export const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice'
export const INWORLD_TTS_STREAM_URL = 'https://api.inworld.ai/tts/v1/voice:stream'
export const INWORLD_VOICES_URL = 'https://api.inworld.ai/voices/v1/voices'

const VOICES_PAGE_SIZE = 500
const MAX_VOICE_PAGES = 20

type ApiVoice = {
  voiceId: string
  displayName?: string
  description?: string
  languageCode?: string
  gender?: string
  ageGroup?: string
  categories?: string[]
  tags?: string[]
  source?: string
}

function voiceOf(v: ApiVoice): Voice {
  const languageCode = v.languageCode ?? ''
  const source = v.source ?? ''
  return {
    voiceId: v.voiceId,
    displayName: v.displayName || v.voiceId,
    description: v.description ?? '',
    languageCode,
    accent: accentOf(languageCode),
    gender: v.gender ?? '',
    ageGroup: v.ageGroup ?? '',
    categories: v.categories ?? [],
    tags: v.tags ?? [],
    source,
    // Community voices are not listed unless asked for, so a voice that is not Inworld's own is the workspace's.
    isCustom: source !== '' && source !== 'SYSTEM',
  }
}

export class InworldTtsAdapter implements TtsAdapter {
  async synthesize(text: string, config: TTSConfig): Promise<Buffer> {
    refuseVoiceVendorInDemo()
    const response = await fetch(INWORLD_TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: config.voiceId,
        model_id: config.model,
        audio_config: { audio_encoding: 'LINEAR16', sample_rate_hertz: 24000 },
      }),
      signal: AbortSignal.timeout(PROVIDER_CALL_TIMEOUT_MS),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      logger.error('[voice:tts] failed', response.status, body.slice(0, 200))
      throw new Error(`Inworld TTS failed: ${response.status} ${response.statusText}`)
    }

    const { audioContent } = await response.json() as { audioContent: string }
    return Buffer.from(audioContent, 'base64')
  }

  async *synthesizeStream(text: string, config: TTSConfig, signal?: AbortSignal): AsyncIterable<{ audio: Buffer; wordTiming?: WordTiming }> {
    refuseVoiceVendorInDemo()
    const tts = InworldTTS({ apiKey: config.apiKey })
    for await (const { audio, timestamps } of tts.streamWithTimestamps({
      text,
      voice: config.voiceId,
      model: config.model,
      encoding: 'PCM',
      sampleRate: 24000,
      timestampType: 'WORD',
    })) {
      if (signal?.aborted) break
      const wa = timestamps?.wordAlignment
      yield {
        audio: Buffer.from(audio),
        wordTiming: wa ? {
          words: wa.words,
          wordStartSecs: wa.wordStartTimeSeconds,
          wordEndSecs: wa.wordEndTimeSeconds,
        } : undefined,
      }
    }
  }

  async listVoices(apiKey: string): Promise<Voice[]> {
    refuseVoiceVendorInDemo()
    const byId = new Map<string, Voice>()
    let pageToken = ''
    for (let page = 0; page < MAX_VOICE_PAGES; page++) {
      const url = `${INWORLD_VOICES_URL}?pageSize=${VOICES_PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const response = await fetch(url, { headers: { Authorization: `Basic ${apiKey}` }, signal: AbortSignal.timeout(PROVIDER_CALL_TIMEOUT_MS) })
      if (!response.ok) {
        throw new Error(`Inworld listVoices failed: ${response.status} ${response.statusText}`)
      }
      const data = await response.json() as { voices?: ApiVoice[]; nextPageToken?: string }
      for (const v of data.voices ?? []) if (v.voiceId) byId.set(v.voiceId, voiceOf(v))
      pageToken = data.nextPageToken ?? ''
      if (!pageToken) break
    }
    return [...byId.values()]
  }
}

export const inworldTtsAdapter = new InworldTtsAdapter()
