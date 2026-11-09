/**
 * Inworld mints at most 60 one-time tokens a minute per key, and every connection attempt from every browser needs
 * one. hq counts what it minted on each provider in the last minute and mints no more past the limit, so the next
 * way of hearing is used instead of the key being refused. One hq process holds the count.
 */
export const INWORLD_MINTS_PER_MINUTE = 60
const WINDOW_MS = 60_000

export function mintLimit(perMinute: number, now: () => number = Date.now) {
  const minted = new Map<string, number[]>()
  const recent = (key: string) => (minted.get(key) ?? []).filter(at => now() - at < WINDOW_MS)
  return {
    /** Takes one mint for `key` if the minute has room; false when it has none. */
    take(key: string): boolean {
      const within = recent(key)
      if (within.length >= perMinute) { minted.set(key, within); return false }
      minted.set(key, [...within, now()])
      return true
    },
  }
}

export const inworldMints = mintLimit(INWORLD_MINTS_PER_MINUTE)
