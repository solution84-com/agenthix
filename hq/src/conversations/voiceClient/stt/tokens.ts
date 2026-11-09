/**
 * A token for the next speech connection, fetched while the current one runs, so replacing a connection never waits
 * on hq. One fetched ahead is used only while fresh, and fetched again before it gets old. Each is used for one
 * connection attempt only: Inworld's are single use.
 *
 * Inworld mints at most 60 a minute for a whole key, so one client fetches at most `MINTS_PER_MINUTE`; one more
 * waits until the minute has room, so a connection that keeps failing cannot use up the key's minute.
 */
import type { Clock } from '../clock'

/** A token fetched ahead is used only this fresh (hq's tokens last ten minutes). */
export const TOKEN_FRESH_MS = 5 * 60_000
/** A token kept ready is fetched again once this old, so one is always ready. */
export const TOKEN_REFRESH_MS = 4 * 60_000

/** Tokens one client fetches in any minute, at most. */
export const MINTS_PER_MINUTE = 20
const MINUTE_MS = 60_000

/** `getToken`, called no more than `perMinute` times in any minute: a call past it starts once the minute has room. */
export function pacedMints<T>(getToken: () => Promise<T>, clock: Pick<Clock, 'now' | 'after'>, perMinute = MINTS_PER_MINUTE) {
  const started: number[] = []
  return (): Promise<T> => {
    const now = clock.now()
    while (started.length && now - started[0]! >= MINUTE_MS) started.shift()
    const at = started.length < perMinute ? now : started[started.length - perMinute]! + MINUTE_MS
    started.push(at)
    if (at <= now) return getToken()
    return new Promise<T>((resolve, reject) => { clock.after(at - now, () => { getToken().then(resolve, reject) }) })
  }
}

export function tokensAhead<T>(fetchToken: () => Promise<T>, clock: Pick<Clock, 'now' | 'after'>) {
  const getToken = pacedMints(fetchToken, clock)
  let ahead: { at: number; token: Promise<T> } | null = null
  const fetchAhead = () => {
    const token = getToken()
    token.catch(() => undefined)
    ahead = { at: clock.now(), token }
  }
  return {
    fetchAhead,
    /** Fetches again a token kept too long. */
    refresh() { if (ahead && clock.now() - ahead.at >= TOKEN_REFRESH_MS) fetchAhead() },
    /** The token ahead if fresh (fetched again, once, if it failed); otherwise a new one. */
    take(): Promise<T> {
      const a = ahead
      ahead = null
      return a && clock.now() - a.at < TOKEN_FRESH_MS ? a.token.catch(() => getToken()) : getToken()
    },
    clear() { ahead = null },
  }
}
