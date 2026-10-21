import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type ProjectsView = 'projects' | 'boards' | 'workspaces' | 'routines'

export const VIEW_LABEL: Record<ProjectsView, string> = { projects: 'Projects', boards: 'Boards', workspaces: 'Workspaces', routines: 'Routines' }
export const VIEWS = Object.keys(VIEW_LABEL) as ProjectsView[]

/** What a board, workspace or routine is made from the split button. */
export type Creating = 'board' | 'workspace' | 'routine'
const CREATING: readonly string[] = ['board', 'workspace', 'routine']

/** What the Projects screen has open, from its address: `/projects?view=boards&project=WEB`. No view is Projects. */
export interface ProjectsScreen {
  view: ProjectsView
  /** The Boards view's project filter, by project key. */
  project: string | null
  /** The Workspaces and Routines views' place filter: a project's key, or `chat`. */
  place: string | null
  archived: boolean
  /** The Routines view's On · Paused filter. */
  state: 'on' | 'paused' | null
  /** A board, workspace or routine being made from the split button, and the place chosen for it. */
  creating: Creating | null
  into: string | null
}

export const CHAT_PLACE = 'chat'

export function screenOf(params: URLSearchParams): ProjectsScreen {
  const view = params.get('view')
  const creating = params.get('new')
  const state = params.get('state')
  return {
    view: view === 'boards' || view === 'workspaces' || view === 'routines' ? view : 'projects',
    project: params.get('project'),
    place: params.get('place'),
    archived: params.get('archived') === '1',
    state: state === 'on' || state === 'paused' ? state : null,
    creating: creating && CREATING.includes(creating) ? creating as Creating : null,
    into: params.get('into'),
  }
}

const CLEARED = { project: null, place: null, archived: null, state: null, new: null, into: null } as const

type Changes = Partial<Record<'view' | 'project' | 'place' | 'archived' | 'state' | 'new' | 'into', string | null>>

/**
 * The screen's place in its address. Moving to another view, or opening a card's boards, adds a history entry so
 * Back returns to where the person was; adjusting a filter within a view replaces it.
 */
export function useProjectsScreenUrl() {
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
    toView: useCallback((view: ProjectsView) => write({ ...CLEARED, view: view === 'projects' ? null : view }, false), [write]),
    toProjectBoards: useCallback((projectKey: string) => write({ view: 'boards', ...CLEARED, project: projectKey }, false), [write]),
    filter: useCallback((changes: Changes) => write(changes, true), [write]),
    startCreating: useCallback((what: Creating, into: string | null = null) => write({ new: what, into }, false), [write]),
    chooseInto: useCallback((into: string | null) => write({ into }, true), [write]),
    stopCreating: useCallback(() => write({ new: null, into: null }, true), [write]),
  }
}
