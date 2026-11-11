/**
 * Agenthix Cloud's routes on the Fleet Console (console/src/http/routes/cloud.ts). A read with no path asks nothing
 * and is `off`; a server that answers 404 counts the same. Otherwise a screen draws what the server says, which for
 * a Fleet Console not connected to Cloud is its not-connected state.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { apiRead } from '../api/quietRead'

export type CloudRead<T> =
  | { phase: 'off' }
  | { phase: 'loading' }
  /** `error` and `readAt` are set when a later read failed while this answer is held: the answer stays, and `readAt` is when it was read. */
  | { phase: 'ready'; value: T; readAt?: Date; error?: unknown }
  | { phase: 'failed'; message: string; code: string; error: unknown }

/** A Cloud read, asked once where it is drawn and tried again quietly if it fails (a held answer stays when a later read fails); `path` null asks nothing (it waits on another read). */
export function useCloudRead<T>(path: string | null): CloudRead<T> & { reload: () => void } {
  const [state, setState] = useState<CloudRead<T>>(path ? { phase: 'loading' } : { phase: 'off' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!path) {
      setState({ phase: 'off' })
      return
    }
    let live = true
    apiRead<T>(path)
      .then(value => { if (live) setState({ phase: 'ready', value, readAt: new Date() }) })
      .catch((err: unknown) => {
        if (!live) return
        if (err instanceof ApiError && err.status === 404) setState({ phase: 'off' })
        else setState(held => held.phase === 'ready' ? { ...held, error: err } : { phase: 'failed', message: err instanceof Error ? err.message : String(err), code: err instanceof ApiError ? err.code : 'failed', error: err })
      })
    return () => { live = false }
  }, [path, round])

  const reload = useCallback(() => setRound(n => n + 1), [])
  return { ...state, reload }
}

export type CloudAsk =
  | { phase: 'idle' }
  | { phase: 'working' }
  | { phase: 'done' }
  /** Refused or not possible yet; said as the server said it. */
  | { phase: 'said'; title: string; message: string; status: number; code: string }

/** What a 409 `not_connected` from a Cloud route is called on screen. */
export const NOT_CONNECTED = 'Not connected'

/** One Cloud action at a time, and what the server said of it. */
export function useCloudAsk() {
  const [ask, setAsk] = useState<CloudAsk>({ phase: 'idle' })
  /** The server's answer once done; null when it was refused or is not available yet. */
  const send = useCallback(async <T = unknown>(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<T | null> => {
    setAsk({ phase: 'working' })
    try {
      const answer = await api<T>(path, { method, body: body ?? (method === 'POST' ? {} : undefined) })
      setAsk({ phase: 'done' })
      return answer
    } catch (err) {
      const title = err instanceof ApiError && err.code === 'not_connected' ? NOT_CONNECTED
        : err instanceof ApiError && err.code === 'not_from_here' ? 'Only on the Fleet Console\'s machine'
        : err instanceof ApiError && err.code === 'rate_limited' ? 'Not yet'
        : 'Not done'
      setAsk({ phase: 'said', title, message: err instanceof Error ? err.message : String(err), status: err instanceof ApiError ? err.status : 0, code: err instanceof ApiError ? err.code : 'failed' })
      return null
    }
  }, [])
  const reset = useCallback(() => setAsk({ phase: 'idle' }), [])
  return { ask, send, reset }
}
