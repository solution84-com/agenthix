/**
 * The speech models voice is built on (models from one place, part 4). Speech is Inworld TTS 2 only: voice steers
 * its emotion to keep a reply continuous. Listening is one of AssemblyAI's live models, all of which work because hq's
 * own turn decision, not the service, says when someone has finished.
 */
export const VOICE_TTS_MODEL = 'inworld-tts-2'

/** The voice a new organisation speaks with, and the last resort when nothing names one. */
export const DEFAULT_VOICE = 'Alistair'

export const LISTENING_MODELS = [
  { model: 'u3-rt-pro', label: 'Universal-3 Pro', languages: '32 languages', note: 'Most accurate' },
  { model: 'universal-streaming-english', label: 'Universal-Streaming', languages: 'English only', note: '' },
  { model: 'universal-streaming-multilingual', label: 'Universal-Streaming Multilingual', languages: '6 languages', note: '' },
] as const

export const DEFAULT_LISTENING_MODEL = 'u3-rt-pro'
