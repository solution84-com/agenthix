import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { sameTarget, viewerTargetOf, withViewer, type ViewerTarget } from './viewerAddress'

/** Marks a history entry the viewer added, so closing it goes back to the entry before rather than adding another. */
const OPENED_HERE = 'fileViewerOpened'

type HistoryState = Record<string, unknown> | null

/**
 * The file viewer over the main area (the file viewer's *One file viewer, one rule*): what it shows, read from the
 * address, and the ways to open and close it. Opening adds a history entry, so the browser's Back closes it; opening
 * another file from inside it replaces the entry, so Back still closes the viewer rather than walking the files.
 */
export function useFileViewer() {
  const location = useLocation()
  const navigate = useNavigate()
  const target = useMemo(() => viewerTargetOf(location.search), [location.search])
  const state = location.state as HistoryState
  const openedHere = !!state?.[OPENED_HERE]

  /**
   * `fromLink`: the address arrived naming the file another way (a task's stable link, `?task=…&file=…`); those
   * parameters are replaced by the viewer's, in the same entry.
   */
  const open = useCallback((next: ViewerTarget, fromLink?: { drop: readonly string[] }) => {
    if (sameTarget(target, next) && !fromLink) return
    const params = new URLSearchParams(location.search)
    for (const name of fromLink?.drop ?? []) params.delete(name)
    const to = { pathname: location.pathname, search: withViewer(params.toString(), next), hash: location.hash }
    // Already open, or opened by a link: the file takes the same entry, keeping whether the viewer added it.
    if (target || fromLink) navigate(to, { replace: true, state })
    else navigate(to, { state: { ...(state ?? {}), [OPENED_HERE]: true } })
  }, [target, location.pathname, location.search, location.hash, navigate, state])

  const close = useCallback(() => {
    if (!target) return
    if (openedHere) { navigate(-1); return }
    // Opened from a link: there is no entry of the viewer's own to go back from.
    navigate({ pathname: location.pathname, search: withViewer(location.search, null), hash: location.hash }, { replace: true, state })
  }, [target, openedHere, navigate, location.pathname, location.search, location.hash, state])

  return { target, open, close }
}
