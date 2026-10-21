import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { joinPhase, type JoinPhase, type JoinView } from './joinWords'

const ENDED: JoinView['state'][] = ['done', 'failed']

/**
 * Follows a join: read every `pollMs` until it ends, with a clock each second for the time left. A 404 means the Fleet
 * Console no longer knows the code. `refused` and `confirm` are the fleet admin's two answers.
 */
export function useJoin(joinId: string | null, pollMs = 2000) {
  const [view, setView] = useState<JoinView | null>(null)
  const [gone, setGone] = useState(false)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const read = useCallback(async () => {
    if (!joinId) return
    try {
      setView((await api<JoinView>(`/joins/${joinId}`)))
      setError(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setGone(true)
      else setError(err instanceof Error ? err.message : String(err))
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
  return {
    view, phase, busy, error,
    confirm: () => act('confirm', answer => { if (answer) setView(answer) }),
    refuse: () => act('refuse', () => setRefused(true)),
  }
}
