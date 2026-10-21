import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../api/client'
import type { Move } from './moveWords'

const ENDED: Move['state'][] = ['done', 'failed', 'cancelled']

/** Follows a move until it ends, read every `pollMs`; cancelling and finishing as the routes allow. */
export function useMove(moveId: string | null, pollMs = 3000) {
  const [move, setMove] = useState<Move | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    if (!moveId) return
    try {
      setMove((await api<{ move: Move }>(`/moves/${moveId}`)).move)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [moveId])

  const ended = move !== null && ENDED.includes(move.state)
  useEffect(() => {
    if (!moveId || ended) return
    void read()
    const poll = window.setInterval(() => { void read() }, pollMs)
    return () => window.clearInterval(poll)
  }, [moveId, ended, read, pollMs])

  const act = (request: Promise<{ move: Move }>) => {
    setBusy(true)
    setError(null)
    request
      .then(({ move: m }) => setMove(m))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return {
    move, busy, error,
    cancel: () => { if (moveId) act(api<{ move: Move }>(`/moves/${moveId}`, { method: 'DELETE' })) },
    finish: () => { if (moveId) act(api<{ move: Move }>(`/moves/${moveId}/finish`, { method: 'POST', body: {} })) },
  }
}

/** A machine's name by its fingerprint, read once; null until read, or when the Fleet Console does not know it. */
export function useMachineName(fingerprint: string | null, known: string | null): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!fingerprint || known) return
    let live = true
    api<{ host: { machineName: string } }>(`/hosts/${fingerprint}`)
      .then(({ host }) => { if (live) setName(host.machineName) })
      .catch(() => {})
    return () => { live = false }
  }, [fingerprint, known])
  return known ?? name
}
