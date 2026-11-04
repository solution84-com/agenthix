/**
 * The copy of the organisation's switches kept for a few seconds (switches.ts). Apart, with no import of Wasp's
 * server, so the integration suite's setup can forget it before each test without loading the database client.
 */
import type { FeatureSwitches } from '@agenthix/core'

/** How long a read of the switches is used before the database is asked again. */
export const SWITCHES_CACHE_MS = 5_000

let cached: { switches: FeatureSwitches; until: number } | null = null
let reading: Promise<FeatureSwitches> | null = null
/** Moves on each forget, so a read begun before it is not kept when it finishes after. */
let generation = 0

/** The switches if read within the last few seconds, else null. */
export function freshFeatureSwitches(now: number = Date.now()): FeatureSwitches | null {
  return cached && cached.until > now ? cached.switches : null
}

/**
 * The fresh copy, else one read shared by every caller that asks while it is under way. A read that fails is not
 * kept, and the caller sees the error: a check never decides from switches it could not read.
 */
export function cachedFeatureSwitches(read: () => Promise<FeatureSwitches>): Promise<FeatureSwitches> {
  const fresh = freshFeatureSwitches()
  if (fresh) return Promise.resolve(fresh)
  if (reading) return reading
  const started = generation
  const mine: Promise<FeatureSwitches> = read()
    .then(switches => {
      if (started === generation) cached = { switches, until: Date.now() + SWITCHES_CACHE_MS }
      return switches
    })
    .finally(() => { if (reading === mine) reading = null })
  reading = mine
  return mine
}

/**
 * Forgets the copy, so the next check reads the database: after a switch changes, and between tests. A read under way
 * is left to finish for its own callers but is not kept, and a caller that arrives now starts a new one.
 */
export function forgetFeatureSwitches(): void {
  cached = null
  reading = null
  generation++
}
