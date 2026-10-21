import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api/client'
import { REFRESH_MS } from '../dashboard/useFleet'
import type { FleetHost } from '../dashboard/types'

export type HostState =
  | { phase: 'loading' }
  | { phase: 'ready'; host: FleetHost; readAt: Date }
  /** `host` is the last read that worked, if any; `missing` when the Fleet Console does not know the machine. */
  | { phase: 'failed'; message: string; missing: boolean; host: FleetHost | null; readAt: Date | null }

/** One machine, read again every 15 seconds while its page is open, and when the window comes back to the front. */
export function useHost(fingerprint: string): HostState & { refresh: () => void } {
  const [state, setState] = useState<HostState>({ phase: 'loading' })
  const last = useRef<{ host: FleetHost; readAt: Date } | null>(null)

  const refresh = useCallback(() => {
    api<{ host: FleetHost }>(`/hosts/${fingerprint}`)
      .then(({ host }) => {
        last.current = { host, readAt: new Date() }
        setState({ phase: 'ready', ...last.current })
      })
      .catch((err: unknown) => {
        setState({
          phase: 'failed',
          message: err instanceof Error ? err.message : String(err),
          missing: err instanceof ApiError && err.status === 404,
          host: last.current?.host ?? null,
          readAt: last.current?.readAt ?? null,
        })
      })
  }, [fingerprint])

  useEffect(() => {
    last.current = null
    setState({ phase: 'loading' })
    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  return { ...state, refresh }
}
