/**
 * *Download the export*: the Fleet Console makes a one-time link behind the session (console/src/exports/downloads.ts),
 * the browser fetches the file from it by itself — so a large export is never held in the page — and the screen
 * follows how it went, in the server's words.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'

type DownloadStatus = {
  state: 'waiting' | 'sending' | 'done' | 'failed'
  sizeBytes: number | null
  sentBytes: number
  problem: string | null
  removedFromMachine: boolean | null
}

export type DownloadView =
  | { phase: 'idle' }
  | { phase: 'sending'; sentBytes: number; sizeBytes: number | null }
  | { phase: 'done'; removedFromMachine: boolean | null }
  | { phase: 'failed'; message: string }

/** Hands the link to the browser, which saves what it fetches as a file. */
function saveFrom(href: string, name: string): void {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function useExportDownload(fingerprint: string, exportId: string, pollMs = 1000): { view: DownloadView; start: () => void } {
  const [view, setView] = useState<DownloadView>({ phase: 'idle' })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const start = useCallback(() => {
    setView({ phase: 'sending', sentBytes: 0, sizeBytes: null })
    void (async () => {
      try {
        const { downloadId, href } = await api<{ downloadId: string; href: string }>(
          `/hosts/${fingerprint}/exports/${encodeURIComponent(exportId)}/download`, { method: 'POST', body: {} },
        )
        saveFrom(href, exportId)
        while (alive.current) {
          await new Promise(resolve => setTimeout(resolve, pollMs))
          if (!alive.current) return
          const { download } = await api<{ download: DownloadStatus }>(`/export-downloads/${downloadId}`)
          if (download.state === 'done') return setView({ phase: 'done', removedFromMachine: download.removedFromMachine })
          if (download.state === 'failed') return setView({ phase: 'failed', message: download.problem ?? 'The download stopped.' })
          setView({ phase: 'sending', sentBytes: download.sentBytes, sizeBytes: download.sizeBytes })
        }
      } catch (err) {
        if (alive.current) setView({ phase: 'failed', message: err instanceof Error ? err.message : String(err) })
      }
    })()
  }, [fingerprint, exportId, pollMs])

  return { view, start }
}
