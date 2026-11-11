import { useContext, useEffect, useState, type ReactNode } from 'react'
import { Nudge } from './Nudge'
import { ReadFailure, ReadNudgesHeld } from './ReadFailure'
import { isFinal } from './retry'

/** What `useBackgroundRead` needs of a query: React Query's result has these. */
export interface BackgroundQuery {
  data: unknown
  /** Set once the policy's retries are spent; null again after the next answer. */
  error: unknown
  /** When the data on screen was read, in ms since the epoch. */
  dataUpdatedAt: number
  refetch: () => unknown
}

export interface BackgroundReadOptions {
  /** The thing, as "The providers", for the nudge in place of the content. */
  what: string
  /** How old the data on screen may be after a failure before it says so. */
  staleAfterMs?: number
  /** A poll's interval: the data may be two of them old before it says so, when that is longer. */
  pollMs?: number
}

export interface BackgroundRead {
  /** The nudge to render, or null: in place of the content when `failedWithoutData`, else for the meta line. */
  nudge: ReactNode
  /** The data on screen is older than the limit, after a failure. */
  stale: boolean
  /**
   * The read failed and there is nothing to show: render `nudge` in place of the content. Check this, not the query's
   * `error`: with data held, a failure keeps the content on screen.
   */
  failedWithoutData: boolean
}

/** The words of a final answer: the server's own, or a plain line. */
function finalWords(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'It is not there for you.'
}

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

/**
 * The one rule for a read the screen makes on its own — opening, polling, refetching — said quietly
 * (DESIGN-SYSTEM.md, *Messages*): nothing during the retries or while the data on screen is fresh. After the retries
 * with nothing on screen, `failedWithoutData` is true and `nudge` goes in place of the content (a final answer in its
 * own words, without Try again). With data held, keep the content on screen: nothing is said until that data is
 * `staleAfterMs` old, then `nudge` is "Not up to date · read HH:MM · Try again" for the meta line, and `stale` is true.
 * A good read clears all three.
 */
export function useBackgroundRead(query: BackgroundQuery, { what, staleAfterMs = 60_000, pollMs = 0 }: BackgroundReadOptions): BackgroundRead {
  const held = useContext(ReadNudgesHeld)
  const [now, setNow] = useState(() => Date.now())
  const failed = query.error !== null && query.error !== undefined
  const hasData = query.data !== undefined
  const limit = Math.max(staleAfterMs, 2 * pollMs)
  const staleAt = query.dataUpdatedAt + limit
  useEffect(() => {
    if (!failed || !hasData) return
    const wait = staleAt - Date.now()
    if (wait <= 0) { setNow(Date.now()); return }
    const t = setTimeout(() => setNow(Date.now()), wait)
    return () => clearTimeout(t)
  }, [failed, hasData, staleAt])
  const retry = () => { void query.refetch() }
  if (!failed) return { nudge: null, stale: false, failedWithoutData: false }
  if (!hasData) {
    const nudge = isFinal(query.error) ? <ReadFailure what={what} final={finalWords(query.error)} /> : <ReadFailure what={what} retry={retry} />
    return { nudge, stale: false, failedWithoutData: true }
  }
  const stale = Math.max(now, Date.now()) >= staleAt
  if (!stale || held) return { nudge: null, stale, failedWithoutData: false }
  return {
    nudge: <Nudge place="meta" action={{ label: 'Try again', onClick: retry }}>Not up to date · read {clock(query.dataUpdatedAt)} ·</Nudge>,
    stale,
    failedWithoutData: false,
  }
}
