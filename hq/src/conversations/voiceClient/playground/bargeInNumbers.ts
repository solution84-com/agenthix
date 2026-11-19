/**
 * Barge-in's numbers the playground tunes: when a reply talked over waits for the person's words (`../orchestration/bargeIn`).
 * Kept like the others, each within its range; the rest of barge-in's settings are the product's.
 */
import { VOICE_SETTINGS, type VoiceSettings } from '../settings'

export type BargeInNumbers = Pick<VoiceSettings['bargeIn'], 'wordsVoiceMs' | 'wordsWaitMs'>

export const BARGE_IN_NUMBERS: BargeInNumbers = { wordsVoiceMs: VOICE_SETTINGS.bargeIn.wordsVoiceMs, wordsWaitMs: VOICE_SETTINGS.bargeIn.wordsWaitMs }

export const BARGE_IN_LIMITS: Record<keyof BargeInNumbers, { min: number; max: number }> = {
  wordsVoiceMs: { min: 100, max: 2_000 },
  wordsWaitMs: { min: 0, max: 3_000 },
}

export const BARGE_IN_ROWS: { key: keyof BargeInNumbers; label: string }[] = [
  { key: 'wordsVoiceMs', label: 'Talked over: wait for the words after voice of' },
  { key: 'wordsWaitMs', label: 'Talked over: wait for them up to' },
]

export function readBargeIn(value: unknown): BargeInNumbers {
  const v = (value ?? {}) as Record<string, unknown>
  const num = (key: keyof BargeInNumbers) => {
    const n = v[key]
    const { min, max } = BARGE_IN_LIMITS[key]
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : BARGE_IN_NUMBERS[key]
  }
  return { wordsVoiceMs: num('wordsVoiceMs'), wordsWaitMs: num('wordsWaitMs') }
}
