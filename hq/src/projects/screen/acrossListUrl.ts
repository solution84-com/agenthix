import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/** What a list's *New …* button makes. */
export type Creating = 'board' | 'workspace' | 'routine'
const CREATING: readonly string[] = ['board', 'workspace', 'routine']

/**
 * What the Boards, Workspaces and Routines pages have open, from their address: `/boards?project=WEB&archived=1`,
 * `/workspaces?place=chat`, `/routines?state=paused`, and `?new=board&into=WEB` while one is being made.
 */
export interface AcrossListScreen {
  /** The Boards page's project filter, by project key. */
  project: string | null
  /** The Workspaces and Routines pages' place filter: a project's key, or `chat`. */
  place: string | null
  archived: boolean
  /** The Routines page's All · On · Paused. */
  state: 'on' | 'paused' | null
  /** A board, workspace or routine being made from the page's *New …*, and the place chosen for it. */
  creating: Creating | null
  into: string | null
}

export const CHAT_PLACE = 'chat'

export function screenOf(params: URLSearchParams): AcrossListScreen {
  const creating = params.get('new')
  const state = params.get('state')
  return {
    project: params.get('project'),
    place: params.get('place'),
    archived: params.get('archived') === '1',
    state: state === 'on' || state === 'paused' ? state : null,
    creating: creating && CREATING.includes(creating) ? creating as Creating : null,
    into: params.get('into'),
  }
}

type Changes = Partial<Record<'project' | 'place' | 'archived' | 'state' | 'new' | 'into', string | null>>

/**
 * The list's place in its address. Starting to make something adds a history entry so Back returns to the list;
 * adjusting a filter, or choosing the place, replaces it.
 */
export function useAcrossListUrl() {
  const [params, setParams] = useSearchParams()
  const screen = screenOf(params)

  const write = useCallback((changes: Changes, replace: boolean) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value)
        else next.delete(name)
      }
      return next
    }, { replace })
  }, [setParams])

  return {
    screen,
    filter: useCallback((changes: Changes) => write(changes, true), [write]),
    startCreating: useCallback((what: Creating, into: string | null = null) => write({ new: what, into }, false), [write]),
    chooseInto: useCallback((into: string | null) => write({ into }, true), [write]),
    stopCreating: useCallback(() => write({ new: null, into: null }, true), [write]),
  }
}
