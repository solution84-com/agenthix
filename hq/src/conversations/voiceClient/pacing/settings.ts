/**
 * Adaptive pacing's numbers and the listening style's (adaptive voice listening, spec §When a turn ends → *Adaptive
 * pacing*, §The light model → *Listening style*). Every number is a setting the voice playground's Tuning changes.
 */
export type PacingSettings = {
  /** On with Adaptive voice (and the light model listening); off, the fixed finish wait and hum window of today. */
  on: boolean
  /** Breaths heard before the learned values apply; until then, the fixed ones. */
  minBreaths: number
  /** The most recent breaths kept: the pace follows the talk as it goes. */
  keep: number
  /** The finish wait: just past this share of their breaths (per cent), plus `finishPadMs`, within its limits. */
  finishSharePct: number
  finishPadMs: number
  finishMinMs: number
  finishMaxMs: number
  /** The hum window's latest start: this share of their breaths (per cent), within its limits. */
  humSharePct: number
  humMinMs: number
  humMaxMs: number
  /** `patient`: this much more quiet before the turn counts as ended, on top of the wait in force. */
  patientExtraMs: number
  /** `hums_fewer`: both hum spacings times this. */
  fewerTimes: number
}

export const PACING_SETTINGS: PacingSettings = {
  on: true, minBreaths: 5, keep: 12, finishSharePct: 90, finishPadMs: 200, finishMinMs: 500, finishMaxMs: 2_500,
  humSharePct: 80, humMinMs: 800, humMaxMs: 2_000, patientExtraMs: 1_000, fewerTimes: 2,
}

export const PACING_LIMITS: Record<Exclude<keyof PacingSettings, 'on'>, { min: number; max: number }> = {
  minBreaths: { min: 1, max: 20 },
  keep: { min: 3, max: 40 },
  finishSharePct: { min: 50, max: 100 },
  finishPadMs: { min: 0, max: 1_000 },
  finishMinMs: { min: 300, max: 3_000 },
  finishMaxMs: { min: 300, max: 3_000 },
  humSharePct: { min: 50, max: 100 },
  humMinMs: { min: 300, max: 3_000 },
  humMaxMs: { min: 300, max: 3_000 },
  patientExtraMs: { min: 0, max: 3_000 },
  fewerTimes: { min: 1, max: 5 },
}

/** Kept settings made safe: each number within its range, each upper limit never under its lower one. */
export function readPacing(value: unknown): PacingSettings {
  const v = (value ?? {}) as Record<string, unknown>
  const num = (key: keyof typeof PACING_LIMITS) => {
    const n = v[key]
    const { min, max } = PACING_LIMITS[key]
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : PACING_SETTINGS[key]
  }
  const finishMinMs = num('finishMinMs')
  const humMinMs = num('humMinMs')
  const minBreaths = num('minBreaths')
  return {
    on: typeof v.on === 'boolean' ? v.on : PACING_SETTINGS.on,
    minBreaths, keep: Math.max(minBreaths, num('keep')),
    finishSharePct: num('finishSharePct'), finishPadMs: num('finishPadMs'), finishMinMs, finishMaxMs: Math.max(finishMinMs, num('finishMaxMs')),
    humSharePct: num('humSharePct'), humMinMs, humMaxMs: Math.max(humMinMs, num('humMaxMs')),
    patientExtraMs: num('patientExtraMs'), fewerTimes: num('fewerTimes'),
  }
}
