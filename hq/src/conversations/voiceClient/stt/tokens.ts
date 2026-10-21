/**
 * A token for the next speech connection, fetched while the current one runs, so replacing a connection never waits
 * on hq. One fetched ahead is used only while fresh, and fetched again before it gets old.
 */
import type { Clock } from '../clock'

/** A token fetched ahead is used only this fresh (hq's tokens last ten minutes). */
export const TOKEN_FRESH_MS = 5 * 60_000
/** A token kept ready is fetched again once this old, so one is always ready. */
export const TOKEN_REFRESH_MS = 4 * 60_000

export function tokensAhead<T>(getToken: () => Promise<T>, clock: Pick<Clock, 'now'>) {
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
