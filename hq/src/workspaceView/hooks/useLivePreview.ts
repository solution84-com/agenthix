import { useCallback, useEffect, useRef } from 'react'
import { useAction, useQuery, getLivePreview, getLivePreviewPlaces, markLivePreviewInUse } from 'wasp/client/operations'
import type { LivePreviewPlaces, LivePreviewView } from '../../livePreviews/types'
import { useOnWorkspaceChange } from './useWorkspaceLive'

/** About once a minute while the live preview is shown, so it does not stop as unused (spec part 4, *States*). */
export const IN_USE_EVERY_MS = 60_000

/**
 * The chosen branch's live preview (spec part 4): where one may start, or the one it has, read again on every event
 * from the workspace's room. While it is shown and live, HQ is told it is in use about once a minute.
 */
export function useLivePreview(workspaceId: string, branchId: string | null, opts: { enabled: boolean; shown: boolean }) {
  const placesQuery = useQuery(getLivePreviewPlaces, { workspaceId, branchId }, { enabled: opts.enabled })
  const places = opts.enabled ? (placesQuery.data as LivePreviewPlaces | undefined) : undefined
  const currentId = places?.current?.livePreviewId ?? null
  const viewQuery = useQuery(getLivePreview, { livePreviewId: currentId ?? '' }, { enabled: opts.enabled && !!currentId })
  const view = currentId ? ((viewQuery.data as LivePreviewView | undefined) ?? places?.current ?? null) : null

  const refetchPlaces = placesQuery.refetch
  const refetchView = viewQuery.refetch
  const enabled = opts.enabled
  const refetch = useCallback(() => {
    if (!enabled) return
    void refetchPlaces()
    if (currentId) void refetchView()
  }, [enabled, currentId, refetchPlaces, refetchView])
  useOnWorkspaceChange(refetch)

  // Wasp answers a new action function on every render, and the action's answer reads the queries again: kept in a
  // ref, so a render never restarts the minute.
  const markAction = useAction(markLivePreviewInUse)
  const markInUse = useRef(markAction)
  markInUse.current = markAction
  const live = view !== null && view.state !== 'stopped'
  const liveId = live ? view.livePreviewId : null
  useEffect(() => {
    if (!opts.shown || !liveId) return
    const tell = () => { Promise.resolve().then(() => markInUse.current({ livePreviewId: liveId })).catch(() => undefined) }
    tell()
    const timer = window.setInterval(tell, IN_USE_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [opts.shown, liveId])

  return {
    places, view, loading: opts.enabled && !places && !placesQuery.error, error: placesQuery.error ?? null, refetch,
    /** When HQ last answered where it stands (ms since the epoch; 0 before it has). */
    placesReadAt: (placesQuery as { dataUpdatedAt?: number }).dataUpdatedAt ?? 0,
  }
}

export type LivePreviewModel = ReturnType<typeof useLivePreview>
