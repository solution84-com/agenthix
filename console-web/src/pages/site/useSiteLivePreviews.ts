import { useCallback, useEffect, useRef, useState } from 'react'
import type { LivePreviewLimit, SiteLivePreviewsView } from '@agenthix/core'
import { api, ApiError } from '../../api/client'
import { REFRESH_MS } from '../dashboard/useFleet'

const path = (fingerprint: string) => `/sites/${fingerprint}/live-previews`

export type LivePreviewsSetting = { allowed: boolean; limit: LivePreviewLimit; idleMinutes: number }

/** One site's live previews as HQ lists them, read when the page opens, every 15 seconds, and after each change. */
export function useSiteLivePreviews(fingerprint: string) {
  const [view, setView] = useState<SiteLivePreviewsView | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(() => {
    api<{ view: SiteLivePreviewsView }>(path(fingerprint))
      .then(r => { if (alive.current) { setView(r.view); setProblem(null) } })
      .catch((err: unknown) => {
        if (!alive.current) return
        // Turned off in hq while the page was open: the section's routes answer 404 now, so what was shown is stale.
        if (err instanceof ApiError && err.status === 404) setView(null)
        setProblem(err instanceof Error ? err.message : String(err))
      })
  }, [fingerprint])

  useEffect(() => {
    setView(null)
    reload()
    const timer = window.setInterval(reload, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [reload])

  return { view, problem, reload }
}

export const setLivePreviews = (fingerprint: string, setting: LivePreviewsSetting, stopAll = false) =>
  api<{ view: SiteLivePreviewsView; stopped: string[] }>(path(fingerprint), { method: 'PUT', body: { ...setting, ...(stopAll ? { stopAll } : {}) } })

export const stopLivePreview = (fingerprint: string, livePreviewId: string) =>
  api<{ stopped: boolean }>(`${path(fingerprint)}/${encodeURIComponent(livePreviewId)}`, { method: 'DELETE' })
