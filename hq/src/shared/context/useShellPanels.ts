import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type ShellPanel = 'notifications' | 'runs'

const PANEL_PARAM = 'panel'
// A run opened inside the Runs panel. Kept as `?runs=<sessionId>` so links made
// before the shell changed still open the same run.
const RUN_PARAM = 'runs'

/**
 * The Notifications and Runs panels open beside the navigation. Their state lives
 * in the URL (`?panel=notifications`, `?panel=runs`, `?runs=<sessionId>`): every
 * page renders its own layout, so the URL is what survives a re-render and what a
 * link can carry. Leaving the page drops the parameters, and with them the panel.
 */
export function useShellPanels() {
  const [searchParams, setSearchParams] = useSearchParams()
  const runSessionId = searchParams.get(RUN_PARAM)
  const panelParam = searchParams.get(PANEL_PARAM)
  const activePanel: ShellPanel | null = runSessionId
    ? 'runs'
    : panelParam === 'notifications' || panelParam === 'runs' ? panelParam : null

  const update = useCallback((panel: ShellPanel | null, runId: string | null = null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (panel) next.set(PANEL_PARAM, panel)
      else next.delete(PANEL_PARAM)
      if (runId) next.set(RUN_PARAM, runId)
      else next.delete(RUN_PARAM)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const openNotifications = useCallback(() => update('notifications'), [update])
  const openRuns = useCallback(() => update('runs'), [update])
  const openRunsSession = useCallback((sessionId: string) => update('runs', sessionId), [update])
  const close = useCallback(() => update(null), [update])
  const toggleNotifications = useCallback(
    () => update(activePanel === 'notifications' ? null : 'notifications'),
    [update, activePanel],
  )
  const toggleRuns = useCallback(
    () => update(activePanel === 'runs' ? null : 'runs'),
    [update, activePanel],
  )

  return {
    activePanel, runSessionId,
    openNotifications, openRuns, openRunsSession, close, toggleNotifications, toggleRuns,
  }
}
