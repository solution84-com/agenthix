/**
 * The speech models voice is built on (models from one place, part 4). Speech is Inworld TTS 2 only: voice steers
 * its emotion to keep a reply continuous. Listening is Inworld's one live model, on the same key that speaks, or one
 * of AssemblyAI's live models; all of them work because hq's own turn decision, not the service, says when someone
 * has finished.
 */
export const VOICE_TTS_MODEL = 'inworld-tts-2'

/** The voice a new organisation speaks with, and the last resort when nothing names one. */
export const DEFAULT_VOICE = 'Alistair'

/** Inworld's live speech to text: one model. */
export const INWORLD_LISTENING_MODEL = 'inworld/inworld-stt-1'

export const LISTENING_MODELS = [
  { model: 'universal-3-6-pro', label: 'Universal-3 Pro', languages: '32 languages', note: 'Most accurate' },
  { model: 'universal-streaming-english', label: 'Universal-Streaming', languages: 'English only', note: '' },
  { model: 'universal-streaming-multilingual', label: 'Universal-Streaming Multilingual', languages: '6 languages', note: '' },
  { model: INWORLD_LISTENING_MODEL, label: 'Inworld STT 1', languages: '30 languages', note: 'Same key as speech' },
] as const

/** AssemblyAI's model a listening choice falls to when none is named. */
export const DEFAULT_LISTENING_MODEL = 'universal-3-6-pro'

/** The model each vendor listens with when voice moves to it without one named. */
const LISTENING_MODEL_OF: Readonly<Record<string, string>> = {
  assemblyai: DEFAULT_LISTENING_MODEL, inworld: INWORLD_LISTENING_MODEL,
}

export function listeningModelOf(vendor: string): string {
  return LISTENING_MODEL_OF[vendor] ?? DEFAULT_LISTENING_MODEL
}

/** The vendors hq can hear through from a browser, the default one first. */
export const HEARING_VENDORS = ['inworld', 'assemblyai'] as const
export type HearingVendor = (typeof HEARING_VENDORS)[number]

export function isHearingVendor(v: unknown): v is HearingVendor {
  return typeof v === 'string' && (HEARING_VENDORS as readonly string[]).includes(v)
}
