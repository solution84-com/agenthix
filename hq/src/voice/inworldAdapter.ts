import { InworldTTS } from '@inworld/tts'
import type { TtsAdapter, TTSConfig, Voice, WordTiming } from './ttsAdapter'
import { Logger } from '../server/utils/logger'

const logger = new Logger('Voice')

export const INWORLD_TTS_URL = 'https://api.inworld.ai/tts/v1/voice'
export const INWORLD_TTS_STREAM_URL = 'https://api.inworld.ai/tts/v1/voice:stream'
export const INWORLD_VOICES_URL = 'https://api.inworld.ai/tts/v1/voices'

export class InworldTtsAdapter implements TtsAdapter {
  async synthesize(text: string, config: TTSConfig): Promise<Buffer> {
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
    const response = await fetch(INWORLD_VOICES_URL, {
      headers: { Authorization: `Basic ${apiKey}` },
    })

    if (!response.ok) {
      throw new Error(`Inworld listVoices failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      voices: Array<{
        voiceId: string
        displayName: string
        description: string
        languages: string[]
        tags: string[]
        isCustom: boolean
      }>
    }
    return data.voices.map(v => ({
      voiceId: v.voiceId,
      displayName: v.displayName,
      description: v.description ?? '',
      languages: v.languages ?? [],
      tags: v.tags ?? [],
      isCustom: v.isCustom ?? false,
    }))
  }
}

export const inworldTtsAdapter = new InworldTtsAdapter()
