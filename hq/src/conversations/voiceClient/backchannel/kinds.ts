/**
 * The listening read's kinds and tones (adaptive voice listening, spec §The listening read): what a small sound of
 * listening means (its kind) and how it is said (its tone). The read keeps nine kinds, since with three it labelled
 * reactions worse; the code maps them to three timing classes (spec §Hum timing): *listen*, *react*, *laugh*. Used by
 * hq's listening read and by the page's hum timing and sound keeper alike.
 */
import { VOICE_HUM_KINDS, VOICE_HUM_TONES, type VoiceHumKind, type VoiceHumTone } from '@agenthix/core'

/** A kind that makes a sound: every kind but `none`. */
export type HumKind = Exclude<VoiceHumKind, 'none'>
export type HumTone = VoiceHumTone

export const HUM_KINDS: readonly HumKind[] = VOICE_HUM_KINDS.filter((k): k is HumKind => k !== 'none')
export const HUM_TONES: readonly HumTone[] = VOICE_HUM_TONES

export type TimingClass = 'listen' | 'react' | 'laugh'

export const TIMING_CLASS: Readonly<Record<HumKind, TimingClass>> = {
  continuer: 'listen', receipt: 'listen', agreement: 'listen', thoughtful: 'listen', realisation: 'listen',
  news: 'react', sympathy: 'react', delight: 'react',
  amusement: 'laugh',
}

export const timingClassOf = (kind: VoiceHumKind): TimingClass | null => (kind === 'none' ? null : TIMING_CLASS[kind])

/** The words of a laugh: spoken as a laugh, not read aloud. */
export const LAUGH_WORDS = '(laughs)'

/**
 * A sound's full steering per tone (spec §Tone, T1, "a sound"). Calm is no direction at all, and no tone's steering
 * holds a speed word: pace belongs to pacing, not tone.
 */
export const SOUND_STEERING: Readonly<Record<HumTone, string>> = {
  calm: '',
  warm: '[warm, encouraging]',
  curious: '[curious, interested]',
  thoughtful: '[low voice, thinking]',
  gentle: '[soft, sympathetic]',
  bright: '[bright, pleased]',
}

/** What the voice playground's page changed a tone's sound steering to: for that page only, never the code. */
export type SteeringChanges = Partial<Record<HumTone, string>>

/**
 * Which kept sound a read's words and tone are: a laugh is one sound in any tone (it takes no steering); other words
 * are kept per tone, compared without case or a trailing full stop.
 */
export function soundKey(words: string, tone: HumTone): string {
  const said = words.trim().toLowerCase().replace(/[.…]+$/, '')
  return said === LAUGH_WORDS ? LAUGH_WORDS : `${said}|${tone}`
}

export const isHumKind = (value: unknown): value is HumKind => typeof value === 'string' && (HUM_KINDS as readonly string[]).includes(value)
export const isHumTone = (value: unknown): value is HumTone => typeof value === 'string' && (HUM_TONES as readonly string[]).includes(value)
