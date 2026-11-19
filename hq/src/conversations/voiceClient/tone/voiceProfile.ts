/**
 * The voice profile (adaptive voice listening, spec §Tone, T2): Inworld's speech to text, asked for it, labels how
 * the person sounds beside their words: an emotion and a vocal style, each a few labels with a 0–1 confidence, most
 * confident first (https://docs.inworld.ai/stt/voice-profiles). Its other categories (age, gender, accent) are not read.
 * Inworld does not say how often a reading comes or what it costs: each is logged with when it came and whether it
 * rode on a final.
 */
import { VOICE_HINTS, type VoiceHint } from '@agenthix/core'

export type VoiceLabel = { label: string; confidence: number }
export type VoiceProfile = { emotion: VoiceLabel[]; style: VoiceLabel[] }

/** How many labels of each category are asked for. */
export const VOICE_PROFILE_TOP_N = 3

function labels(value: unknown): VoiceLabel[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((l): l is { label: string; confidence: number } =>
      typeof l?.label === 'string' && typeof l.confidence === 'number' && Number.isFinite(l.confidence))
    .map(l => ({ label: l.label.toLowerCase(), confidence: Math.min(1, Math.max(0, l.confidence)) }))
    .sort((a, b) => b.confidence - a.confidence)
}

/** A transcription's profile, camelCase or snake_case; null when it carries no emotion or style. */
export function readVoiceProfile(transcription: unknown): VoiceProfile | null {
  const t = transcription as { voiceProfile?: unknown; voice_profile?: unknown } | null | undefined
  const p = (t?.voiceProfile ?? t?.voice_profile) as { emotion?: unknown; vocalStyle?: unknown; vocal_style?: unknown } | undefined
  if (!p || typeof p !== 'object') return null
  const profile = { emotion: labels(p.emotion), style: labels(p.vocalStyle ?? p.vocal_style) }
  return profile.emotion.length || profile.style.length ? profile : null
}

/**
 * The voice hint a reading gives (spec §Tone, T2): the vocal style first where it is one hq offers (laughing, crying,
 * whispering), else the emotion, the top label of each at `min` confidence or more. Calm, neutral, anger, disgust and
 * the plain styles give none: the agent never mirrors anger, and calm needs no hint.
 */
export function hintOf(p: Pick<VoiceProfile, 'emotion' | 'style'>, min: number): VoiceHint | null {
  for (const l of [topAt(p.style, min), topAt(p.emotion, min)]) {
    if (l && (VOICE_HINTS as readonly string[]).includes(l.label)) return l.label as VoiceHint
  }
  return null
}

/** The Log's words for a reading: `happy 0.71 · laughing 0.83`, each category's top label. */
export function profileWords(p: VoiceProfile): string {
  return [p.emotion[0], p.style[0]].filter((l): l is VoiceLabel => !!l).map(l => `${l.label} ${l.confidence.toFixed(2)}`).join(' · ')
}

/** Its top label at `min` confidence or more, of a category; null when none is. */
export const topAt = (labels: readonly VoiceLabel[], min: number): VoiceLabel | null =>
  labels[0] && labels[0].confidence >= min ? labels[0] : null

/** The person laughs: the vocal style `laughing` at `min` or more, wherever it ranks. */
export const laughing = (p: VoiceProfile, min: number) => p.style.some(l => l.label === 'laughing' && l.confidence >= min)
