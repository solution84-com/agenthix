/**
 * What the lead is told of the workspaces in its places (live preview spec, *Which work is code work*): each place's
 * workspaces, and which are code workspaces, so it can give code work to a task on that workspace. Read from the
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

/** The lines create_task's description lists for the places' workspaces; none when there are none. */
export function describeWorkspaces(places: readonly PlaceWithWorkspaces[]): string[] {
  const lines = places.flatMap(p => p.workspaces.map(w => `- ${p.key}: ${w.name} (workspaceId ${w.id})${w.git ? ': a code workspace (Git)' : ''}`))
  if (lines.length === 0) return []
  return [
    '',
    'Workspaces in these places. Pass a workspace\'s id as workspaceId to have the task work there:',
    ...lines,
    'Work that changes the code of a code workspace goes to a task on that workspace: it works on a branch of its ' +
      'own, and a person merges it into main. Never change a code workspace\'s files yourself, or from another place.',
  ]
}

/** The same, read for the places given (`key` as the lead names the place). */
export async function workspaceLines(places: readonly { key: string; type: 'project' | 'user'; id: string }[]): Promise<string[]> {
  return describeWorkspaces(await Promise.all(places.map(async p => ({ key: p.key, workspaces: await placeWorkspaces(p.type, p.id) }))))
}
