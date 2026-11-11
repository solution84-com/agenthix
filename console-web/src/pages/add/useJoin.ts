import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { api, ApiError } from '../../api/client'
import { apiRead, backgroundQuery, becauseOf } from '../../api/quietRead'
import { joinPhase, type JoinPhase, type JoinView } from './joinWords'

const ENDED: JoinView['state'][] = ['done', 'failed']
/** Held in place of a first answer, so the quiet read's failure is the meta line, never the block in place of the content. */
const OPENED = {}

/**
 * Follows a join: read every `pollMs` until it ends, with a clock each second for the time left. A 404 means the Fleet
 * Console no longer knows the code. `refused` and `confirm` are the fleet admin's two answers.
 */
export function useJoin(joinId: string | null, pollMs = 2000) {
  const [view, setView] = useState<JoinView | null>(null)
  const [gone, setGone] = useState(false)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  /** A press (Confirm, Refuse) that failed. */
  const [error, setError] = useState<string | null>(null)
  /** The poll's own failure, after its retries: said quietly, never as the press's. */
  const [readError, setReadError] = useState<unknown>(null)
  const [readAt, setReadAt] = useState<Date | null>(null)
  /** When the join was opened: the code is on screen from then, so a poll that has not yet answered leaves held content. */
  const openedAt = useMemo(() => new Date(), [joinId])
  const reading = useRef(false)
  const [now, setNow] = useState(() => new Date())

  const read = useCallback(async () => {
    if (!joinId || reading.current) return
    reading.current = true
    try {
      setView((await apiRead<JoinView>(`/joins/${joinId}`)))
      setReadAt(new Date())
      setReadError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setGone(true)
      else setReadError(err)
    } finally {
      reading.current = false
    }
  }, [joinId])

  const ended = gone || refused || (view !== null && ENDED.includes(view.state))
  useEffect(() => {
    setView(null)
    setGone(false)
    setRefused(false)
  }, [joinId])
  useEffect(() => {
    if (!joinId || ended) return
    void read()
    const poll = window.setInterval(() => { void read() }, pollMs)
    const tick = window.setInterval(() => setNow(new Date()), 1000)
    return () => { window.clearInterval(poll); window.clearInterval(tick) }
  }, [joinId, ended, read, pollMs])

  const act = (path: string, then: (answer: JoinView | undefined) => void) => {
    if (!joinId) return
    setBusy(true)
    setError(null)
    api<JoinView | undefined>(`/joins/${joinId}/${path}`, { method: 'POST', body: {} })
      .then(then)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) setGone(true)
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setBusy(false))
  }

  const phase: JoinPhase | null = view || gone || refused ? joinPhase(gone ? null : view, now, refused) : null
  const quiet = useBackgroundRead(backgroundQuery({ data: view ?? (joinId ? OPENED : undefined), error: readError, readAt: readAt ?? openedAt, refetch: () => { void read() } }), { what: 'The join', pollMs, because: becauseOf })
  return {
    view, phase, busy, error,
    /** The quiet nudge for the poll, for the meta line (the code and the steps stay on screen). */
    nudge: quiet.nudge,
    confirm: () => act('confirm', answer => { if (answer) setView(answer) }),
    refuse: () => act('refuse', () => setRefused(true)),
  }
}
