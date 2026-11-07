/**
 * What the lead is told of the workspaces in its places (live preview spec, *Which work is code work*): each place's
 * workspaces, and which are code workspaces, so it can start work in one (start_work's `workspace`) or give it to a
 * task on it (create_task's `workspaceId`); either works on a branch of its own in a code workspace. Read from the
 * sites that hold them, and kept for a minute so a conversation's turns do not ask again each time.
 */
import type { LocationRef } from '@agenthix/core'
import { listWorkspacesByOwner } from '../storage/workspaceStore'
import { resolveOwnerSiteId } from '../storage/ownerSite'
import { repoStateOnSite } from '../storage/repoWorkStore'

export type PlaceWorkspace = { id: string; name: string; git: boolean }

const KEEP_MS = 60_000
const kept = new Map<string, { at: number; workspaces: PlaceWorkspace[] }>()

export function __resetPlaceWorkspacesForTests(): void {
  kept.clear()
}

/** The owner's workspaces, each with whether it is a Git repository; none when its site cannot answer. */
export async function placeWorkspaces(ownerType: 'project' | 'user', ownerId: string): Promise<PlaceWorkspace[]> {
  const key = `${ownerType}:${ownerId}`
  const hit = kept.get(key)
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.workspaces
  let workspaces: PlaceWorkspace[] = []
  try {
    const siteId = await resolveOwnerSiteId(ownerType, ownerId)
    if (siteId) {
      const rows = await listWorkspacesByOwner(siteId, ownerType, ownerId, 'names')
      workspaces = await Promise.all(rows.map(async (w) => {
        const loc: LocationRef = { ownerType, ownerId, workspaceId: w.id, taskId: null }
        const git = await repoStateOnSite(siteId, loc).then(s => s.isGitRepo, () => false)
        return { id: w.id, name: w.name, git }
      }))
    }
  } catch {
    return []
  }
  kept.set(key, { at: Date.now(), workspaces })
  return workspaces
}

/** A place, as the lead names it, with its workspaces. */
export type PlaceWithWorkspaces = { key: string; workspaces: readonly PlaceWorkspace[] }

function workspaceList(places: readonly PlaceWithWorkspaces[]): string[] {
  return places.flatMap(p => p.workspaces.map(w => `- ${p.key}: ${w.name} (workspaceId ${w.id})${w.git ? ': a code workspace (Git)' : ''}`))
}

/** The lines create_task's description lists for the places' workspaces; none when there are none. */
export function describeWorkspaces(places: readonly PlaceWithWorkspaces[]): string[] {
  const lines = workspaceList(places)
  if (lines.length === 0) return []
  return [
    '',
    'Workspaces in these places. Pass a workspace\'s id as workspaceId to have the task work there:',
    ...lines,
    'A task on a code workspace works on a branch of its own, and a person merges it into main. Make one when the ' +
      'person asks for a task; for a change they ask of you, start work in the workspace (start_work) instead. Never ' +
      'change a code workspace\'s files yourself, or from another place.',
  ]
}

/** The lines start_work's description lists for the places' workspaces; none when there are none. */
export function describeWorkerWorkspaces(places: readonly PlaceWithWorkspaces[]): string[] {
  const lines = workspaceList(places)
  if (lines.length === 0) return []
  return [
    '',
    'Workspaces in these places. For work that changes a workspace, or works in it, pass its id as `workspace`:',
    ...lines,
    'Work in a code workspace is on this conversation\'s own branch there, made at its first run and kept for its ' +
      'later ones, and a person merges it into main. A branch that is another conversation\'s or a task\'s is ' +
      'changed only from its own chat: when the person asks to change one, say whose it is and that the ask goes ' +
      'there. Never change a code workspace\'s files without naming it.',
  ]
}

type PlaceRef = { key: string; type: 'project' | 'user'; id: string }

const withWorkspaces = (places: readonly PlaceRef[]): Promise<PlaceWithWorkspaces[]> =>
  Promise.all(places.map(async p => ({ key: p.key, workspaces: await placeWorkspaces(p.type, p.id) })))

/** create_task's lines, read for the places given (`key` as the lead names the place). */
export async function workspaceLines(places: readonly PlaceRef[]): Promise<string[]> {
  return describeWorkspaces(await withWorkspaces(places))
}

/** start_work's lines, read for the places given. */
export async function workerWorkspaceLines(places: readonly PlaceRef[]): Promise<string[]> {
  return describeWorkerWorkspaces(await withWorkspaces(places))
}
