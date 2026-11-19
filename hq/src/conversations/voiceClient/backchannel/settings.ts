/**
 * The backchannel's rules (adaptive voice listening, spec §The backchannel): when a small sound of listening plays
 * while the person talks, with no model call. Every threshold is a setting the voice playground's Tuning changes.
 */
export type BackchannelSettings = {
  /** On with Adaptive voice (and the light model listening); the playground can switch it off to compare. */
  on: boolean
  /** A pause this long, with the sound model still saying not finished, may get a hum. */
  pauseMs: number
  /** A pause longer than this gets none by these rules: a hum then sounds like a late reply to a finished turn. */
  latestPauseMs: number
  /** The person's own speech, summed, since the agent last made any sound: the only spacing between two hums. */
  speechMs: number
  /** A reaction hum's spacing instead (sympathy, news, delight, amusement: `./reaction`): it belongs to its moment. */
  reactionSpeechMs: number
  /** Two reactions in a row need a listening hum, or this much of the person's speech, between them. */
  reactionGapSpeechMs: number
  /** A reaction the hum service answered is not replaced by a plainer answer, or `none`, for this long, or until it plays. */
  reactionHoldMs: number
  /** The hums play this far under a reply's level, since they come in the person's pauses. */
  gainDb: number
  /** The hum service picks the kind of each hum; off, every hum is a plain continuer. */
  serviceOn: boolean
  /** How often the hum service is asked while the person speaks. */
  serviceIntervalMs: number
}

export const BACKCHANNEL_SETTINGS: BackchannelSettings = {
  on: true, pauseMs: 400, latestPauseMs: 1_200, speechMs: 6_000, reactionSpeechMs: 3_000, reactionGapSpeechMs: 8_000, reactionHoldMs: 4_000, gainDb: -6,
  serviceOn: true, serviceIntervalMs: 1_000,
}

/** An answer that comes later than this after its question is dropped, and a question in flight that long is given up. */
export const HUM_STALE_MS = 2_000

/** The range the playground offers each number in. */
export const BACKCHANNEL_LIMITS: Record<Exclude<keyof BackchannelSettings, 'on' | 'serviceOn'>, { min: number; max: number }> = {
  serviceIntervalMs: { min: 500, max: 3_000 },
  pauseMs: { min: 200, max: 2_000 },
  latestPauseMs: { min: 300, max: 3_000 },
  speechMs: { min: 2_000, max: 30_000 },
  reactionSpeechMs: { min: 0, max: 10_000 },
  reactionGapSpeechMs: { min: 0, max: 30_000 },
  reactionHoldMs: { min: 0, max: 10_000 },
  gainDb: { min: -24, max: 0 },
}

/** Kept settings made safe: each number within its range, the latest pause never before the pause. */
export function readBackchannel(value: unknown): BackchannelSettings {
  const v = (value ?? {}) as Record<string, unknown>
  const num = (key: keyof typeof BACKCHANNEL_LIMITS) => {
    const n = v[key]
    const { min, max } = BACKCHANNEL_LIMITS[key]
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.min(max, Math.max(min, n))) : BACKCHANNEL_SETTINGS[key]
  }
  const pauseMs = num('pauseMs')
  return {
    on: typeof v.on === 'boolean' ? v.on : BACKCHANNEL_SETTINGS.on,
    pauseMs, latestPauseMs: Math.max(pauseMs, num('latestPauseMs')), speechMs: num('speechMs'),
    reactionSpeechMs: num('reactionSpeechMs'), reactionGapSpeechMs: num('reactionGapSpeechMs'), reactionHoldMs: num('reactionHoldMs'), gainDb: num('gainDb'),
    serviceOn: typeof v.serviceOn === 'boolean' ? v.serviceOn : BACKCHANNEL_SETTINGS.serviceOn, serviceIntervalMs: num('serviceIntervalMs'),
  }
}
