/**
 * Tone's settings (adaptive voice listening, spec §Tone): one switch, and the voice profile's confidence bars. Every
 * number is one the voice playground's Tuning changes. With Tone on and Adaptive voice on, Inworld's speech to text is
 * asked for the voice profile (from the next speech connection), and how the person sounds goes to hq as the voice hint;
 * off, every layer speaks calm, no hint is offered, and a laugh back comes only from a read that says amusement.
 */
export type ToneSettings = {
  /** The Tone switch: each layer speaks in the tone it picks; off, all calm. */
  on: boolean
  /** The vocal style `laughing` at this confidence or more lets the next pause play a laugh back. */
  laughConfidence: number
  /** A voice label below this confidence is no hint. */
  voiceConfidence: number
  /**
   * The language Inworld's speech to text is told the person speaks: English for now, so a short or unclear utterance
   * is never written in another language. `any` lets the service detect it, for when more languages are supported.
   */
  speechLanguage: SpeechLanguage
}

export type SpeechLanguage = 'en' | 'any'

export const TONE_SETTINGS: ToneSettings = { on: true, laughConfidence: 0.6, voiceConfidence: 0.6, speechLanguage: 'en' }

export const TONE_LIMITS = { laughConfidence: { min: 0.3, max: 0.95 }, voiceConfidence: { min: 0.3, max: 0.95 } } as const

/** Kept settings made safe: each confidence within its range, to two places. Settings kept before the switch are on. */
export function readTone(value: unknown): ToneSettings {
  const v = (value ?? {}) as Record<string, unknown>
  const conf = (key: keyof typeof TONE_LIMITS) => {
    const n = v[key]
    const { min, max } = TONE_LIMITS[key]
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n)) * 100) / 100 : TONE_SETTINGS[key]
  }
  return {
    on: typeof v.on === 'boolean' ? v.on : TONE_SETTINGS.on,
    laughConfidence: conf('laughConfidence'), voiceConfidence: conf('voiceConfidence'),
    speechLanguage: v.speechLanguage === 'any' ? 'any' : 'en',
  }
}

/** Tone is on: the light model listens (the flag and Adaptive voice) and the switch is on. */
export const toneOn = (s: { voiceListener: boolean; adaptiveVoice: boolean; tone: ToneSettings }) =>
  s.voiceListener && s.adaptiveVoice && s.tone.on
