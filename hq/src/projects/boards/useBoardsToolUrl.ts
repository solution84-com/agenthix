import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { OVERRIDE_PARAMS, type ViewOverrides } from './boardViewModel'

/** Which board: a built-in one, a saved one by its id, or a new view not yet saved. */
export type BoardKey = 'state' | 'execution' | 'new' | string

export type BoardsScreen =
  | { kind: 'list' }
  | { kind: 'board'; board: BoardKey; overrides: ViewOverrides }
  | { kind: 'task'; board: BoardKey; overrides: ViewOverrides; taskKey: string }
  | { kind: 'session'; board: BoardKey; overrides: ViewOverrides; taskKey: string }

const OVERRIDE_NAMES = Object.entries(OVERRIDE_PARAMS) as Array<[keyof ViewOverrides, string]>

function overridesOf(params: URLSearchParams): ViewOverrides {
  const o: ViewOverrides = {}
  for (const [part, name] of OVERRIDE_NAMES) {
    const value = params.get(name)
    if (value) o[part] = value
  }
  return o
}

/**
 * Where the Boards tool is, read from the address: `?tool=boards&board=state`, a saved board's id, or `new`; the view
 * changed on screen and not saved (`bcols`, `bsprint`, `bepic`, `bagent`, `btype`); and a task opened from it (`btask`).
 * Leaving an unsaved view asks nothing: it lives only in the address.
 */
export function screenOf(params: URLSearchParams): BoardsScreen {
  const board = params.get('board')
  if (!board) return { kind: 'list' }
  const overrides = overridesOf(params)
  const taskKey = params.get('btask')
  if (taskKey) return params.get('bview') === 'session' ? { kind: 'session', board, overrides, taskKey } : { kind: 'task', board, overrides, taskKey }
  return { kind: 'board', board, overrides }
}

const OWN = ['board', 'bview', 'btask', ...Object.values(OVERRIDE_PARAMS)]

const withOverrides = (board: BoardKey, overrides: ViewOverrides): Record<string, string | undefined> => ({
  board, ...Object.fromEntries(OVERRIDE_NAMES.map(([part, name]) => [name, overrides[part]])),
})

/** The tool's own place in the address; moving within it replaces the entry, as opening a tool does. */
export function useBoardsToolUrl() {
  const [params, setParams] = useSearchParams()
  const screen = screenOf(params)

  const go = useCallback((values: Record<string, string | null | undefined>) => {
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
    toBoard: useCallback((board: BoardKey, overrides: ViewOverrides = {}) => go(withOverrides(board, overrides)), [go]),
    toTask: useCallback((board: BoardKey, overrides: ViewOverrides, taskKey: string) =>
      go({ ...withOverrides(board, overrides), btask: taskKey }), [go]),
    toSession: useCallback((board: BoardKey, overrides: ViewOverrides, taskKey: string) =>
      go({ ...withOverrides(board, overrides), btask: taskKey, bview: 'session' }), [go]),
  }
}
