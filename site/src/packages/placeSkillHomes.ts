/**
 * Where a place's skills are on disk, for a scan and for staging (spec part 1 L4–L6): the place's files home for its
 * own skills and one agent's, and a workspace's repository for its three folders. Each is returned as its real path,
 * and only when it is where the layout puts it: a run can replace `files/` or a workspace with a link, and resolving
 * through it would make the link's target the place. Every read under one rechecks containment (skillTree.ts).
 */
import path from 'node:path'
import { PLACE_SKILLS_ROOT, WORKSPACE_SKILL_ROOTS, agentSkillsRoot, type LocationRef } from '@agenthix/core'
import { getCodeDir, getFilesDir, getWorkspaceDir, ownerDir } from '../server/storage/paths'
import { isCodeWorkspace } from '../server/storage/codeSpace'
import { realFilesHome, realpathOrNull } from './boundaryOverrides'

export type SkillPlace = Pick<LocationRef, 'ownerType' | 'ownerId'>

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export async function placeFilesHome(place: SkillPlace): Promise<string | null> {
  try {
    return await realFilesHome(place, getFilesDir(place.ownerType, place.ownerId))
  } catch {
    return null
  }
}

export async function workspaceHome(place: SkillPlace, workspaceId: string): Promise<string | null> {
  if (!ID.test(workspaceId)) return null
  try {
    // A repository workspace's skills are those of its `main`, in the code space (adr-0173).
    const repo = { ownerType: place.ownerType, ownerId: place.ownerId, workspaceId }
    if (await isCodeWorkspace(repo)) return await realpathOrNull(getCodeDir(repo))
    const dir = getWorkspaceDir({ ...place, id: workspaceId })
    const [real, realOwner] = await Promise.all([realpathOrNull(dir), realpathOrNull(ownerDir(place.ownerType, place.ownerId))])
    return real && realOwner && real === path.join(realOwner, 'workspaces', workspaceId) ? real : null
  } catch {
    return null
  }
}

/** Where a skill hq named sits, from its path as hq keeps it (hq's `placeSkillPath`). */
export type NamedSkillPath =
  | { group: 'place'; root: string; slug: string }
  | { group: 'agent'; agentId: string; root: string; slug: string }
  | { group: 'workspace'; workspaceId: string; root: string; slug: string }

/** Null for a path of any other shape, or one that does not fit its group. */
export function parseNamedSkillPath(group: string, p: string): NamedSkillPath | null {
  if (typeof p !== 'string' || p.length > 512) return null
  const slug = p.slice(p.lastIndexOf('/') + 1)
  const parent = p.slice(0, p.lastIndexOf('/'))
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null
  if (group === 'place') return parent === PLACE_SKILLS_ROOT ? { group, root: parent, slug } : null
  if (group === 'agent') {
    const match = parent.match(/^\.agents\/agents\/([^/]+)\/skills$/)
    return match && agentSkillsRoot(match[1]) === parent ? { group, agentId: match[1], root: parent, slug } : null
  }
  if (group === 'workspace') {
    const match = parent.match(/^workspace\/([^/]+)\/(.+)$/)
    if (!match || !ID.test(match[1]) || !WORKSPACE_SKILL_ROOTS.includes(match[2])) return null
    return { group, workspaceId: match[1], root: match[2], slug }
  }
  return null
}
