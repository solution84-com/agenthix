import type { BoardAcrossProjects } from '../boardsAcrossProjects'
import { CHAT_PLACE } from './projectsScreenUrl'
import type { PlaceRef } from '../placeAddresses'

/** A board's place: its project, or the person's Chat when the project is their own. */
export const boardPlace = (b: BoardAcrossProjects): PlaceRef & { name: string; filterValue: string } =>
  b.project.isPersonal
    ? { key: null, name: 'Chat', filterValue: CHAT_PLACE }
    : { key: b.project.key, name: b.project.name, filterValue: b.project.key }

const matches = (text: string, search: string) => !search.trim() || text.toLowerCase().includes(search.trim().toLowerCase())

/** The Boards view's rows: active or archived, in one project when filtered, matching the search. */
export function visibleBoards(boards: BoardAcrossProjects[], opts: { archived: boolean; project: string | null; search: string }): BoardAcrossProjects[] {
  return boards.filter(b =>
    (opts.archived ? !!b.archivedAt : !b.archivedAt) &&
    (!opts.project || boardPlace(b).filterValue === opts.project) &&
    matches(`${b.name} ${boardPlace(b).name}`, opts.search))
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

/** The Routines view's place filter value: a project's key, or `chat`. */
export const routinePlaceValue = (r: { project: { key: string | null } }): string => r.project.key ?? CHAT_PLACE

/** The Routines view's rows: in one place when filtered, on or paused when filtered, matching the search. */
export function visibleRoutines<R extends { title: string; enabled: boolean; project: { key: string | null; name: string } }>(
  routines: R[],
  opts: { place: string | null; state: 'on' | 'paused' | null; search: string },
): R[] {
  return routines.filter(r =>
    (!opts.place || routinePlaceValue(r) === opts.place) &&
    (!opts.state || (opts.state === 'on') === r.enabled) &&
    matches(`${r.title} ${r.project.name}`, opts.search))
}
