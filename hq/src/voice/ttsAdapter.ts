export interface TTSConfig {
  apiKey: string
  voiceId: string
  model: string
}

/** A voice from Inworld's Voice API, with the fields its filters use. */
// A type, not an interface: an operation's answer must be assignable to Wasp's JSON payload.
export type Voice = {
  voiceId: string
  displayName: string
  description: string
  /** BCP-47, such as `en-GB`. */
  languageCode: string
  /** The accent in words, from the region of `languageCode`; empty when the code has no region. */
  accent: string
  /** `male`, `female` or `neutral`; empty when unspecified. */
  gender: string
  /** `young`, `middle_aged` or `elderly`; empty when unspecified. */
  ageGroup: string
  /** Use cases, as Inworld names them: `companions`, `healthcare`, ... */
  categories: string[]
  tags: string[]
  source: string
  /** Made in the organisation's own Inworld workspace rather than one of Inworld's. */
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
