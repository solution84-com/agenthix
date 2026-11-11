import { useEffect, useState } from 'react'
import { useQuery, getHqReadOnly } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import { HQ_NOT_ANSWERING, readOnlyLine } from './shellNoticeWords'

/** How long the live connection is down, with reads failing, before the frame says HQ is not answering. */
export const NOT_ANSWERING_AFTER_MS = 30_000
/** While the live connection is down, HQ is asked this often, so the frame knows whether reads still come back. */
const PROBE_WHILE_DOWN_MS = 10_000
const PROBE_MS = 30_000

/** What the frame needs of the probe: when it last answered, and when it last failed (0 for never). */
export type Probe = { dataUpdatedAt: number; errorUpdatedAt: number }

/**
 * HQ is not answering: only the browser can know it (decision 4). The live connection has been down for
 * `NOT_ANSWERING_AFTER_MS`, and the last read since it went down failed. A read that comes back, or the connection
 * coming back, clears it.
 */
export function notAnswering(downSince: number | null, probe: Probe, now: number): boolean {
  if (downSince === null || now - downSince < NOT_ANSWERING_AFTER_MS) return false
  return probe.errorUpdatedAt >= downSince && probe.errorUpdatedAt > probe.dataUpdatedAt
}

export type FrameLineState = { words: string | null; holdReadNudges: boolean }

export const NO_FRAME_LINE: FrameLineState = { words: null, holdReadNudges: false }

/**
 * The frame line's words — the state of HQ as a whole, one line at a time, not answering first — and whether the
 * screens' own "could not be read" nudges are held back while it shows (they are, while HQ is not answering: one
 * cause, said once).
 */
export function useFrameLine(): FrameLineState {
  const { isConnected } = useSocket()
  const [downSince, setDownSince] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { setDownSince(isConnected ? null : Date.now()) }, [isConnected])
  const probe = useQuery(getHqReadOnly, undefined, {
    refetchInterval: downSince === null ? PROBE_MS : PROBE_WHILE_DOWN_MS,
    // While the connection is down the probe is the retry: each failure counts at once.
    retry: downSince === null ? undefined : false,
  })
  const answers: Probe = { dataUpdatedAt: probe.dataUpdatedAt ?? 0, errorUpdatedAt: probe.errorUpdatedAt ?? 0 }

  // Wake when the 30 seconds are up, so the line shows without waiting for the next probe.
  useEffect(() => {
    if (downSince === null) return
    const wait = downSince + NOT_ANSWERING_AFTER_MS - Date.now()
    if (wait <= 0) return
    const t = setTimeout(() => setNow(Date.now()), wait)
    return () => clearTimeout(t)
  }, [downSince])

  const away = notAnswering(downSince, answers, Math.max(now, Date.now()))
  if (away) return { words: HQ_NOT_ANSWERING, holdReadNudges: true }
  const readOnly = probe.data
  if (readOnly?.readOnly) return { words: readOnlyLine(readOnly.since, Intl.DateTimeFormat().resolvedOptions().timeZone), holdReadNudges: false }
  return { words: null, holdReadNudges: false }
}
