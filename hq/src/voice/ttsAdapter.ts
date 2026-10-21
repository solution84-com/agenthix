export interface TTSConfig {
  apiKey: string
  voiceId: string
  model: string
}

export interface Voice {
  voiceId: string
  displayName: string
  description: string
  languages: string[]
  tags: string[]
  isCustom: boolean
}

export interface WordTiming {
  words: string[]
  wordStartSecs: number[]
  wordEndSecs: number[]
}

export interface TtsAdapter {
  synthesize(text: string, config: TTSConfig): Promise<Buffer>
  synthesizeStream(text: string, config: TTSConfig, signal?: AbortSignal): AsyncIterable<{ audio: Buffer; wordTiming?: WordTiming }>
  listVoices(apiKey: string): Promise<Voice[]>
}
