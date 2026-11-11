import { useCallback, useEffect, useRef, useState } from 'react'
import type { FleetActivityEntry, FleetActivityPage } from '@agenthix/core'
import { api, ApiError } from '../../api/client'
import { apiRead } from '../../api/quietRead'

export type ActivityProblem = { code: string; message: string; error: unknown }

/** The record, a page at a time: the newest page when the screen opens, earlier ones when asked. */
export function useActivity() {
  const [entries, setEntries] = useState<FleetActivityEntry[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [problem, setProblem] = useState<ActivityProblem | null>(null)
  /** "Show earlier" pressed and failed: a press that did not happen, said apart from the opening read. */
  const [moreProblem, setMoreProblem] = useState<string | null>(null)
  const [readAt, setReadAt] = useState<Date | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const read = useCallback(async (after: string | null) => {
    try {
      const path = `/activity${after ? `?after=${encodeURIComponent(after)}` : ''}`
      // The opening read is the screen's own and retried quietly; "Show earlier" is a press, so it is asked once.
      const page = after ? await api<FleetActivityPage>(path) : await apiRead<FleetActivityPage>(path)
      if (!alive.current) return
      setEntries(before => (after && before ? [...before, ...page.entries] : page.entries))
      setNext(page.next)
      setProblem(null)
      setMoreProblem(null)
      if (!after) setReadAt(new Date())
    } catch (err) {
      if (!alive.current) return
      if (after) setMoreProblem(err instanceof Error ? err.message : String(err))
      else setProblem(err instanceof ApiError ? { code: err.code, message: err.message, error: err } : { code: 'failed', message: String(err), error: err })
    }
  }, [])

  const reload = useCallback(() => { void read(null) }, [read])
  useEffect(reload, [reload])

  const more = useCallback(() => {
    if (!next) return
    setLoadingMore(true)
    void read(next).finally(() => { if (alive.current) setLoadingMore(false) })
  }, [next, read])

  return { entries, next, problem, moreProblem, readAt, loadingMore, reload, more }
}
