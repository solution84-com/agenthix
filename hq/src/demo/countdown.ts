/** The demo's countdown to its next reset (live demo spec, *Getting in* and *Reset*), in words. Pure. */

/** In the last this-many minutes the frame line warns that the visitor's work is about to be wiped. */
export const RESET_WARNING_MINUTES = 10

/** Minutes left, rounded up so the line never says 0 before the reset: at least 1. */
export function minutesLeft(nextResetAt: string, now: number): number {
  return Math.max(1, Math.ceil((Date.parse(nextResetAt) - now) / 60_000))
}

/** "2 h 14 min", "2 h", "8 min". */
export function timeLeft(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** The entry page's countdown: "Next reset in 2 h 14 min". */
export function nextResetLine(nextResetAt: string, now: number): string {
  return `Next reset in ${timeLeft(minutesLeft(nextResetAt, now))}`
}

/** When the demo was last reset, in words: "Last reset 2 h 14 min ago", "Last reset just now". */
export function lastResetLine(lastResetAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(lastResetAt)) / 60_000)
  return minutes < 1 ? 'Last reset just now' : `Last reset ${timeLeft(minutes)} ago`
}

/**
 * The frame line's demo state, lowest of its states: "Demo — shared with other visitors · resets in 2 h 14 min",
 * and in the last 10 minutes "Resets in 8 min — what you've done here will be wiped".
 */
export function demoFrameWords(nextResetAt: string, now: number): string {
  const minutes = minutesLeft(nextResetAt, now)
  if (minutes <= RESET_WARNING_MINUTES) return `Resets in ${timeLeft(minutes)} — what you've done here will be wiped`
  return `Demo — shared with other visitors · resets in ${timeLeft(minutes)}`
}
