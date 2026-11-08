import type { ProjectBoards } from '../boardViewsAcrossProjects'
import { CHAT_PLACE } from './acrossListUrl'
import type { PlaceRef } from '../placeAddresses'

/** A project's place: the project, or the person's Chat when the project is their own. */
export const projectPlace = (p: ProjectBoards['project']): PlaceRef & { name: string; filterValue: string } =>
  p.isPersonal
    ? { key: null, name: 'Chat', filterValue: CHAT_PLACE }
    : { key: p.key, name: p.name, filterValue: p.key }

const matches = (text: string, search: string) => !search.trim() || text.toLowerCase().includes(search.trim().toLowerCase())

/**
 * The Boards page's groups: one per project in its order, narrowed to one project when filtered, each keeping the boards
 * whose name or project matches the search; a project with nothing matching is left out.
 */
export function visibleBoards(groups: ProjectBoards[], opts: { project: string | null; search: string }): ProjectBoards[] {
  return groups
    .filter(g => !opts.project || projectPlace(g.project).filterValue === opts.project)
    .map(g => ({ ...g, boards: g.boards.filter(b => matches(`${b.name} ${projectPlace(g.project).name}`, opts.search)) }))
    .filter(g => g.boards.length > 0)
}

export interface WorkspaceRowData {
  id: string
  name: string
  repoUrl: string | null
  siteLabel: string | null
  previewRunning: boolean
  place: { ownerType: 'project' | 'user'; ownerId: string; key: string | null; name: string }
}

export const workspacePlaceValue = (w: WorkspaceRowData): string => w.place.key ?? CHAT_PLACE

export function visibleWorkspaces(workspaces: WorkspaceRowData[], opts: { place: string | null; search: string }): WorkspaceRowData[] {
  return workspaces.filter(w =>
    (!opts.place || workspacePlaceValue(w) === opts.place) &&
    matches(`${w.name} ${w.place.name} ${w.repoUrl ?? ''}`, opts.search))
}

/** The Routines page's place filter value: a project's key, or `chat`. */
export const routinePlaceValue = (r: { project: { key: string | null } }): string => r.project.key ?? CHAT_PLACE

/** The Routines page's rows: in one place when filtered, on or paused when filtered, matching the search. */
export function visibleRoutines<R extends { title: string; enabled: boolean; project: { key: string | null; name: string } }>(
  routines: R[],
  opts: { place: string | null; state: 'on' | 'paused' | null; search: string },
): R[] {
  return routines.filter(r =>
    (!opts.place || routinePlaceValue(r) === opts.place) &&
    (!opts.state || (opts.state === 'on') === r.enabled) &&
    matches(`${r.title} ${r.project.name}`, opts.search))
}
