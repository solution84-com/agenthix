import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type BoardsScreen =
  | { kind: 'list' }
  | { kind: 'archived' }
  | { kind: 'new' }
  | { kind: 'board'; boardId: string; mode: 'columns' | 'timeline' | 'finish'; sprintId: string | null }
  | { kind: 'task'; boardId: string; taskKey: string; atWaiting: boolean }
  | { kind: 'session'; boardId: string; taskKey: string }

/**
 * Where the Boards tool is, read from the address: `?tool=boards&board=<id>&btask=WEB-27`. The names carry a
 * `b` where the Tasks tool has the same idea, so neither reads the other's leftovers when the panel switches tools.
 */
export function screenOf(params: URLSearchParams): BoardsScreen {
  const boardId = params.get('board')
  const view = params.get('bview')
  const taskKey = params.get('btask')
  if (!boardId) return view === 'archived' ? { kind: 'archived' } : view === 'new' ? { kind: 'new' } : { kind: 'list' }
  if (taskKey) {
    return view === 'session' ? { kind: 'session', boardId, taskKey } : { kind: 'task', boardId, taskKey, atWaiting: params.get('bat') === 'waiting' }
  }
  const mode = view === 'timeline' ? 'timeline' : view === 'finish' ? 'finish' : 'columns'
  return { kind: 'board', boardId, mode, sprintId: params.get('bsprint') }
}

const OWN = ['board', 'bview', 'btask', 'bat', 'bsprint', 'ttask', 'tview'] as const

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useBoardsToolUrl() {
  const [params, setParams] = useSearchParams()
  const screen = screenOf(params)

  const go = useCallback((values: Partial<Record<(typeof OWN)[number], string | null>>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const name of OWN) next.delete(name)
      for (const [name, value] of Object.entries(values)) if (value) next.set(name, value)
      return next
    }, { replace: true })
  }, [setParams])

  return {
    screen,
    toList: useCallback(() => go({}), [go]),
    toArchived: useCallback(() => go({ bview: 'archived' }), [go]),
    toNew: useCallback(() => go({ bview: 'new' }), [go]),
    toBoard: useCallback((boardId: string, opts: { mode?: 'timeline' | 'finish'; sprintId?: string | null } = {}) =>
      go({ board: boardId, bview: opts.mode ?? null, bsprint: opts.sprintId ?? null }), [go]),
    toTask: useCallback((boardId: string, taskKey: string, atWaiting = false) =>
      go({ board: boardId, btask: taskKey, bat: atWaiting ? 'waiting' : null }), [go]),
    toSession: useCallback((boardId: string, taskKey: string) => go({ board: boardId, btask: taskKey, bview: 'session' }), [go]),
  }
}
