/**
 * Tone in hq (adaptive voice listening, spec §Tone): each layer picks the tone of its own speech as it speaks — the
 * light model a `tone` with its answer, the reply a `[tone: …]` tag at its start (`../lead/toneTag.ts`) — and it is
 * worded here and only here: "some" for a line, "a little" for the reply. Calm adds nothing, and is sent as before: no
 * direction at all; no other tone's steering says calm, or a speed word (pace belongs to pacing, not tone). Only a tone
 * hq knows is looked up, never a string from the page or a model; and only on a model
 * that takes a direction (`spokenAs`), so no other model reads it aloud. Only what the speech service is sent is
 * steered: the words shown, stored and timed stay as written.
 *
 * The Tone switch and the voice hint come from the holder's page (`voiceTone`, hq's own pages only); until it says,
 * Tone is off: every layer is told calm and no hint is offered.
 */
import { VOICE_HINTS, VOICE_HUM_TONES, type VoiceHint, type VoiceHumTone } from '@agenthix/core'

type Steered = Exclude<VoiceHumTone, 'calm'>

/** A light model's line: some of the tone. */
export const LINE_STEERING: Readonly<Record<Steered, string>> = {
  warm: '[warm]',
  curious: '[interested]',
  thoughtful: '[thoughtful]',
  gentle: '[soft, kind]',
  bright: '[pleased]',
}

/** The reply: a little of the tone. */
export const REPLY_STEERING: Readonly<Record<Steered, string>> = {
  warm: '[a little warm]',
  curious: '[a little curious]',
  thoughtful: '[a little thoughtful]',
  gentle: '[a little softer]',
  bright: '[a little pleased]',
}

export const toneOf = (value: unknown): VoiceHumTone | null =>
  (VOICE_HUM_TONES as readonly unknown[]).includes(value) ? value as VoiceHumTone : null

/** The steering for a tone, or null for calm or none. */
export const steeringOf = (table: Readonly<Record<Steered, string>>, tone: VoiceHumTone | null): string | null =>
  tone && tone !== 'calm' ? table[tone] : null

/** Tone for a voice session, as the holder's page last said: the switch, and how the person sounds. */
export type VoiceToneState = { on: boolean; hint: VoiceHint | null }

export const TONE_OFF: VoiceToneState = { on: false, hint: null }

/** A `voiceTone` payload: on only when it says `true`; a hint only when it is one hq knows. */
export function voiceToneOf(payload: unknown): VoiceToneState {
  const p = (payload ?? {}) as Record<string, unknown>
  const hint = (VOICE_HINTS as readonly unknown[]).includes(p.hint) ? p.hint as VoiceHint : null
  return { on: p.on === true, hint }
}

/** The voice hint in hq's own words, as the light model and the listening read are offered it. */
export const HINT_WORDS: Readonly<Record<VoiceHint, string>> = {
  happy: 'sounds happy',
  laughing: 'laughing',
  tender: 'sounds tender',
  sad: 'sounds sad',
  fearful: 'sounds worried',
  crying: 'sounds tearful',
  whispering: 'whispering',
  surprised: 'sounds surprised',
}

/** The hint to offer: none with Tone off. */
export const hintWords = (tone: VoiceToneState): string | null => (tone.on && tone.hint ? HINT_WORDS[tone.hint] : null)

/** The tone a layer picked, as it is spoken: calm with Tone off. */
export const spokenTone = (tone: VoiceToneState, picked: VoiceHumTone | null): VoiceHumTone | null => (tone.on ? picked : null)

/** A direction timed by the speech service may come as several tokens (`[a little` … `pleased]`): none of them is a word said. */
export function inDirection(word: string, inside: boolean): { skip: boolean; inside: boolean } {
  if (inside) return { skip: true, inside: !word.includes(']') }
  if (word.startsWith('[')) return { skip: true, inside: !word.includes(']') }
  return { skip: false, inside: false }
}
