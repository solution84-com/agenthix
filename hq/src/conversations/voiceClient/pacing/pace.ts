/**
 * Adaptive pacing's estimate (adaptive voice listening, spec §When a turn ends → *Adaptive pacing*), pure. A breath is
 * a pause in the person's turn after which they went on talking (a false finish counts too); from their most recent
 * ones, once there are enough, it sets the quiet READY waits for before the turn counts as ended (just past 9 in 10 of
 * their breaths, plus a little) and the latest a hum may start in a pause (8 in 10 of them), each within its limits.
 * Before then, today's fixed values.
 */
import { finishWait } from '../listener/settings'
import type { VoiceSettings } from '../settings'
import type { PacingSettings } from './settings'

/** What the pace sets: null until enough breaths are heard. */
export type Learned = {
  finishWaitMs: number; latestPauseMs: number
  /** The breath that share of them are under, and the share (per cent), for the finish wait and for the hum window. */
  finishShareMs: number; finishSharePct: number; humShareMs: number; humSharePct: number
}

/** The breath that `pct` per cent of them are at or under (the nearest rank). */
export function shareUnder(breathMs: readonly number[], pct: number): number {
  const sorted = [...breathMs].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((pct / 100) * sorted.length))
  return sorted[Math.min(sorted.length, rank) - 1]!
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function learnedOf(breathMs: readonly number[], p: PacingSettings): Learned | null {
  const recent = breathMs.slice(-p.keep)
  if (recent.length < p.minBreaths) return null
  const finishShareMs = shareUnder(recent, p.finishSharePct)
  const humShareMs = shareUnder(recent, p.humSharePct)
  return {
    finishShareMs, humShareMs, finishSharePct: p.finishSharePct, humSharePct: p.humSharePct,
    finishWaitMs: Math.round(clamp(finishShareMs + p.finishPadMs, p.finishMinMs, p.finishMaxMs)),
    latestPauseMs: Math.round(clamp(humShareMs, p.humMinMs, p.humMaxMs)),
  }
}

/** A breath heard: kept with the most recent ones. */
export const withBreath = (breathMs: readonly number[], ms: number, p: PacingSettings) => [...breathMs, ms].slice(-Math.max(1, p.keep))

/** The pace as the scheduler and the backchannel take it: the learned values while adaptive pacing is on. */
export const inForce = (learned: Learned | null, settings: VoiceSettings): Learned | null => (settings.pacing.on ? learned : null)

/**
 * The quiet READY needs now. The learned wait (or today's first wait) is where it starts, `patient` adds its extra,
 * and each false finish this turn steps it up as before, up to the larger of its Most and the learned wait's upper
 * limit (a learned wait near that limit still has room to step), never past the pause cap. `applies`: READY waits for
 * it (with none of these, it counts as it comes, as before).
 */
export function finishWaitNow(
  settings: VoiceSettings, learned: Learned | null, falseFinishes: number, patient: boolean,
): { waitMs: number; applies: boolean } {
  const timing = settings.listener
  const extra = patient ? settings.pacing.patientExtraMs : 0
  const first = (learned?.finishWaitMs ?? timing.finishWaitMs) + extra
  const most = (learned ? Math.max(timing.finishWaitMostMs, settings.pacing.finishMaxMs) : timing.finishWaitMostMs) + extra
  const waitMs = finishWait({ ...timing, finishWaitMs: first, finishWaitMostMs: most }, falseFinishes, settings.pause.capMs)
  return { waitMs, applies: falseFinishes > 0 || learned !== null || patient }
}
