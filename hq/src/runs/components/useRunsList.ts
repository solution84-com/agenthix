import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, getRunsPage } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import type { SiteSilence } from '@agenthix/core'
import type { RunListItem, RunsFilters, RunsPageResult } from '../screenTypes'

export const itemKey = (r: RunListItem) => r.runId ?? `queued:${r.ref ?? r.title}`

/**
 * The Runs screen's list under its filters: the newest page, then each Older runs › page appended, keeping the
 * place. Filters change the list from the top. While older pages are shown the newest page is not re-read, so what
 * is on screen stays where the cursor says it is.
 */
export function useRunsList(filters: RunsFilters) {
  const first = useQuery(getRunsPage, filters)
  const [older, setOlder] = useState<RunsPageResult[]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [failed, setFailed] = useState(false)

  const filterKey = JSON.stringify(filters)
  useEffect(() => { setOlder([]); setFailed(false) }, [filterKey])

  const { refetch } = first
  useSocketListener('agentRunStatus', useCallback(() => { if (older.length === 0) void refetch() }, [refetch, older.length]))

  const cursor = older.length > 0 ? older[older.length - 1].nextCursor : first.data?.nextCursor ?? null

  const loadOlder = useCallback(async () => {
    if (!cursor) return
    setLoadingOlder(true)
    setFailed(false)
    try {
      const page = await getRunsPage({ ...filters, cursor })
      setOlder((pages) => [...pages, page])
    } catch {
      setFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [cursor, filters])

  const runs = useMemo(() => {
    const seen = new Set<string>()
    return [...(first.data?.runs ?? []), ...older.flatMap((p) => p.runs)].filter((r) => {
      const key = itemKey(r)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [first.data, older])

  const unanswered = useMemo(() => {
    const bySite = new Map<string, SiteSilence>()
    for (const s of [...(first.data?.unanswered ?? []), ...older.flatMap((p) => p.unanswered)]) bySite.set(s.siteId, s)
    return [...bySite.values()]
  }, [first.data, older])

  return { runs, unanswered, hasOlder: cursor !== null, loadOlder, loadingOlder, failed, isLoading: first.isLoading, error: first.error }
}
