import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type TimelineOpen = { taskKey: string; session: boolean } | null

/** The task open in the timeline, read from the address: `?ttask=WEB-27&tview=session`. */
export function openOf(params: URLSearchParams): TimelineOpen {
  const taskKey = params.get('ttask')
  return taskKey ? { taskKey, session: params.get('tview') === 'session' } : null
}

/**
 * A task opened from the timeline lives in the address, so a reload keeps it and Back returns to the chart.
 * The names carry a `t`, so the Tasks and Boards tools do not read them; moving replaces the entry, as opening a tool does.
 */
export function useTimelineTaskUrl() {
  const [params, setParams] = useSearchParams()
  const go = useCallback((taskKey: string | null, session = false) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('ttask')
      next.delete('tview')
      if (taskKey) {
        next.set('ttask', taskKey)
        if (session) next.set('tview', 'session')
      }
      return next
    }, { replace: true })
  }, [setParams])
  return {
    open: openOf(params),
    openTask: useCallback((taskKey: string) => go(taskKey), [go]),
    openSession: useCallback((taskKey: string) => go(taskKey, true), [go]),
    close: useCallback(() => go(null), [go]),
  }
}
