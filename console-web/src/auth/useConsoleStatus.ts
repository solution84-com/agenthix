import { useCallback, useEffect, useState } from 'react'
import { getStatus, type ConsoleStatus } from '../api/session'

export type StatusState =
  | { phase: 'loading' }
  | { phase: 'ready'; status: ConsoleStatus }
  | { phase: 'unreachable'; message: string }

/**
 * The Fleet Console's own status (`GET /api/status`, open before sign-in): the machine it runs on, and whether HQ
 * answers. While sign-in cannot work (HQ not answering, nobody with the role), it is asked again every few seconds,
 * so the page opens up by itself once the machine admin has put it right.
 */
export function useConsoleStatus(recheckMs = 5_000): StatusState & { refresh: () => void } {
  const [state, setState] = useState<StatusState>({ phase: 'loading' })

  const refresh = useCallback(() => {
    getStatus()
      .then(status => setState({ phase: 'ready', status }))
      .catch((err: unknown) => setState({ phase: 'unreachable', message: err instanceof Error ? err.message : String(err) }))
  }, [])

  useEffect(refresh, [refresh])

  const blocked = state.phase === 'unreachable' ||
    (state.phase === 'ready' && (state.status.hq !== 'connected' || state.status.fleetAdmins === 'none'))
  useEffect(() => {
    if (!blocked) return
    const timer = window.setInterval(refresh, recheckMs)
    return () => window.clearInterval(timer)
  }, [blocked, refresh, recheckMs])

  return { ...state, refresh }
}
