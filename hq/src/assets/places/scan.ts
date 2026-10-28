/**
 * What a scan of a place's files found, kept as `PlaceSkill` rows (spec part 4 *Observed, not controlled*). One row
 * per skill folder, keyed by place and a path that says which root it was found under, so two workspaces' folders of
 * the same name stay two skills (security review M2). A folder no longer found keeps its row, marked gone, for its
 * history; a scan cut short by a bound marks nothing gone. A scan lists the place's own folder, one agent's and the
 * workspaces it was given, so only rows under those roots can be marked gone by it: another agent's or another
 * workspace's skills are not in its answer and stay as they were.
 */
import { prisma } from 'wasp/server'
import type { PlaceSkill, PlaceSkillGroup, Prisma, WorkspaceOwnerType } from '@prisma/client'
import { PLACE_SKILLS_ROOT, WORKSPACE_SKILL_ROOTS, agentSkillsRoot, type LocationScanSkillsResult, type ScannedSkill } from '@agenthix/core'

export type Place = { placeType: WorkspaceOwnerType; placeId: string }

/** What a scan covered: the place's own folder always, one agent's folder, and the workspaces it was given. */
export type ScanCovered = { agentId: string | null; workspaceIds: string[] }

const GROUPS: Record<ScannedSkill['group'], PlaceSkillGroup> = { place: 'PLACE', agent: 'AGENT', workspace: 'WORKSPACE' }

/** A relative path of plain segments: no `..` or `.`, no leading `/`, no backslash, no empty segment. */
function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path === '' || path.includes('\\') || path.includes('\0')) return false
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
}

/** The row's path: the root a skill was found under, then its folder. Null for a finding that names no safe root. */
export function placeSkillPath(skill: ScannedSkill): string | null {
  if (!isSafeRelativePath(skill.path)) return null
  if (skill.group === 'place') return `${PLACE_SKILLS_ROOT}/${skill.path}`
  if (skill.group === 'agent') {
    const root = skill.agentId ? agentSkillsRoot(skill.agentId) : null
    return root ? `${root}/${skill.path}` : null
  }
  if (!skill.workspaceId || !skill.workspaceFolder || !WORKSPACE_SKILL_ROOTS.includes(skill.workspaceFolder)) return null
  if (!isSafeRelativePath(skill.workspaceId) || skill.workspaceId.includes('/')) return null
  return `workspace/${skill.workspaceId}/${skill.workspaceFolder}/${skill.path}`
}

export async function recordScan(
  place: Place,
  scan: LocationScanSkillsResult,
  covered: ScanCovered = { agentId: null, workspaceIds: [] },
  now = new Date(),
): Promise<PlaceSkill[]> {
  const seen: string[] = []
  const rows: PlaceSkill[] = []
  for (const skill of scan.skills) {
    const path = placeSkillPath(skill)
    if (!path) continue
    seen.push(path)
    const found = {
      group: GROUPS[skill.group],
      agentId: skill.group === 'agent' ? skill.agentId ?? null : null,
      workspaceId: skill.group === 'workspace' ? skill.workspaceId ?? null : null,
      lastFingerprint: skill.fingerprint,
      lastSeenAt: now,
      goneAt: null,
    }
    rows.push(await prisma.placeSkill.upsert({
      where: { placeType_placeId_path: { ...place, path } },
      create: { ...place, path, ...found },
      update: found,
    }))
  }
  if (!scan.truncated) {
    await prisma.placeSkill.updateMany({
      where: { ...place, path: { notIn: seen }, goneAt: null, OR: coveredRoots(covered) },
      data: { goneAt: now },
    })
  }
  return rows
}

function coveredRoots(covered: ScanCovered): Prisma.PlaceSkillWhereInput[] {
  const roots: Prisma.PlaceSkillWhereInput[] = [{ group: 'PLACE' }]
  if (covered.agentId) roots.push({ group: 'AGENT', agentId: covered.agentId })
  if (covered.workspaceIds.length) roots.push({ group: 'WORKSPACE', workspaceId: { in: covered.workspaceIds } })
  return roots
}
