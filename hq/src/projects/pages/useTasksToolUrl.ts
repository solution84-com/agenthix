import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type TasksScreen =
  | { kind: 'list' }
  | { kind: 'backlog' }
  | { kind: 'done' }
  | { kind: 'task'; taskKey: string; atWaiting: boolean }
  | { kind: 'session'; taskKey: string }

/** Where the Tasks tool is, read from the address: `?tool=tasks&task=WEB-27&view=session` (every screen reviewed spec §3). */
export function screenOf(params: URLSearchParams): TasksScreen {
  const view = params.get('view')
  const taskKey = params.get('task')
  if (taskKey) {
    return view === 'session' ? { kind: 'session', taskKey } : { kind: 'task', taskKey, atWaiting: params.get('at') === 'waiting' }
  }
  return view === 'backlog' ? { kind: 'backlog' } : view === 'done' ? { kind: 'done' } : { kind: 'list' }
}

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useTasksToolUrl() {
  const [params, setParams] = useSearchParams()
  const screen = screenOf(params)

  const go = useCallback((view: string | null, task: string | null, at: string | null = null) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [name, value] of [['view', view], ['task', task], ['at', at]] as const) {
        if (value) next.set(name, value)
        else next.delete(name)
      }
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen,
    toList: useCallback(() => go(null, null), [go]),
    toBacklog: useCallback(() => go('backlog', null), [go]),
    toDone: useCallback(() => go('done', null), [go]),
    toTask: useCallback((taskKey: string, atWaiting = false) => go(null, taskKey, atWaiting ? 'waiting' : null), [go]),
    toSession: useCallback((taskKey: string) => go('session', taskKey), [go]),
  }
}
