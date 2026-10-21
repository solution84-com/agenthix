import { useCallback, useEffect, useRef, useState } from 'react'
import type { FleetActivityEntry, FleetActivityPage } from '@agenthix/core'
import { api, ApiError } from '../../api/client'

export type ActivityProblem = { code: string; message: string }

/** The record, a page at a time: the newest page when the screen opens, earlier ones when asked. */
export function useActivity() {
  const [entries, setEntries] = useState<FleetActivityEntry[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [problem, setProblem] = useState<ActivityProblem | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const read = useCallback(async (after: string | null) => {
    try {
      const page = await api<FleetActivityPage>(`/activity${after ? `?after=${encodeURIComponent(after)}` : ''}`)
      if (!alive.current) return
      setEntries(before => (after && before ? [...before, ...page.entries] : page.entries))
      setNext(page.next)
      setProblem(null)
    } catch (err) {
      if (!alive.current) return
      setProblem(err instanceof ApiError ? { code: err.code, message: err.message } : { code: 'failed', message: String(err) })
    }
  }, [])

  const reload = useCallback(() => { void read(null) }, [read])
  useEffect(reload, [reload])

  const more = useCallback(() => {
    if (!next) return
    setLoadingMore(true)
    void read(next).finally(() => { if (alive.current) setLoadingMore(false) })
  }, [next, read])

  return { entries, next, problem, loadingMore, reload, more }
}
