/**
 * The place's skills in files a run is told about (spec part 4 *Defaults and switches*, D13, H3): hq asks the place's
 * site to scan before the run is dispatched, keeps what it found as `PlaceSkill` rows (new ones follow the default, so
 * under *Off by default* they are off), and names each switched-on skill by place, path and fingerprint. The site
 * stages one only when what it reads then has that fingerprint. A site that can't scan gives no file skills that turn.
 */
import {
  LOCATION_FILE_METHODS, WORKSPACE_SKILL_ROOTS, isValidPackagePath,
  type FileSkillEntry, type LocationScanSkillsParams, type LocationScanSkillsResult, type ScannedSkill,
} from '@agenthix/core'
import type { FileSkillsDefault, PlaceSkill } from '@prisma/client'
import type { Db } from '../../packages/packageStore'
import { siteChannelRegistry } from '../../sites/channel'
import { boundedFindings, placeSkillPath, recordScan, type Place } from '../places/scan'
import { switchState } from '../places/switchState'
import { skillKey } from './clashOrder'

export type ScanPlace = (siteId: string, params: LocationScanSkillsParams) => Promise<LocationScanSkillsResult>

export const scanPlaceOnSite: ScanPlace = (siteId, params) =>
  siteChannelRegistry.request(siteId, LOCATION_FILE_METHODS.scanSkills, params)

/**
 * What a scan reported that hq keeps: a folder under one of the roots the scan was asked for, by a plain relative path,
 * with a fingerprint. A finding for another agent or another workspace than this run's is left out.
 */
export function keptFindings(scan: LocationScanSkillsResult, agentId: string, workspaceIds: string[]): ScannedSkill[] {
  return boundedFindings(scan).skills.filter(s =>
    isValidPackagePath(s.path)
    && (s.group === 'place'
      || (s.group === 'agent' && s.agentId === agentId)
      || (s.group === 'workspace' && typeof s.workspaceId === 'string' && workspaceIds.includes(s.workspaceId)
        && typeof s.workspaceFolder === 'string' && WORKSPACE_SKILL_ROOTS.includes(s.workspaceFolder))))
}

export type FileSkillCandidate = { entry: FileSkillEntry; key: string; label: string; rowId: string }

/** The switched-on skills among what the scan found, by the row it was kept as. */
export function switchedOn(
  found: ScannedSkill[], rows: PlaceSkill[], placeId: string, placeDefault: FileSkillsDefault | null, orgDefault: FileSkillsDefault,
): FileSkillCandidate[] {
  const byPath = new Map(rows.map(r => [r.path, r]))
  const out: FileSkillCandidate[] = []
  for (const skill of found) {
    const path = placeSkillPath(skill)
    const row = path ? byPath.get(path) : undefined
    if (!path || !row || row.lastFingerprint !== skill.fingerprint) continue
    if (switchState(row, placeDefault, orgDefault) !== 'on') continue
    out.push({
      entry: { placeId, path, fingerprint: skill.fingerprint, group: skill.group },
      key: skillKey({ identity: skill.identity, name: skill.name, path }),
      label: skill.name?.trim() || path,
      rowId: row.id,
    })
  }
  return out
}

/** The default a place sets for itself: a project's own, or for a person's storage, Your space's. */
export async function placeDefaultOf(db: Db, place: Place): Promise<FileSkillsDefault | null> {
  const project = place.placeType === 'project'
    ? await db.project.findUnique({ where: { id: place.placeId }, select: { fileSkillsDefault: true } })
    : await db.project.findFirst({ where: { personalOwnerId: place.placeId, personalSpace: true }, select: { fileSkillsDefault: true } })
  return project?.fileSkillsDefault ?? null
}

export type FileSkillsResult = { candidates: FileSkillCandidate[]; found: ScannedSkill[]; rows: PlaceSkill[]; problem: string | null }

export async function fileSkillsFor(
  db: Db,
  input: { siteId: string; place: Place; agentId: string; workspaceIds: string[]; orgDefault: FileSkillsDefault },
  scan: ScanPlace = scanPlaceOnSite,
): Promise<FileSkillsResult> {
  const none = (problem: string | null): FileSkillsResult => ({ candidates: [], found: [], rows: [], problem })
  const placeDefault = await placeDefaultOf(db, input.place)
  if (input.orgDefault === 'NEVER' || placeDefault === 'NEVER') return none(null)
  let result: LocationScanSkillsResult
  try {
    result = await scan(input.siteId, {
      loc: { ownerType: input.place.placeType, ownerId: input.place.placeId },
      agentId: input.agentId,
      ...(input.workspaceIds.length ? { workspaces: input.workspaceIds.map(id => ({ id, folder: id })) } : {}),
    })
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return none(`Skills in this place's files were not read this turn: the site could not list them (${why}).`)
  }
  const found = keptFindings(result, input.agentId, input.workspaceIds)
  const cut = boundedFindings(result).cut
  const rows = await recordScan(input.place, { ...result, skills: found, truncated: cut }, { agentId: input.agentId, workspaceIds: input.workspaceIds })
  return {
    candidates: switchedOn(found, rows, input.place.placeId, placeDefault, input.orgDefault),
    found,
    rows,
    problem: cut ? 'Not every skill in this place\'s files was listed: a bound was reached.' : null,
  }
}
