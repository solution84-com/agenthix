/**
 * A place's site, in memory, for the place skill tests: `vi.mock('../siteSkills', () => import('./fakeSite'))`. Skill
 * folders are kept by owner, workspace and folder; a scan lists the place's own and one agent's, fingerprinted as the
 * site does. `failWrites` makes the next writes refuse, as a site that can't write would.
 */
import type { LocationRef, LocationScanSkillsResult, ScannedSkill } from '@agenthix/core'
import { fingerprintOf } from '../../content'
import type { PackageFile } from '../../../library/packages/packageZip'
import { LifecycleError } from '../../lifecycle/errors'

export const disk = new Map<string, PackageFile[]>()
export const site = { failWrites: false }

const key = (loc: LocationRef, dir: string) => `${loc.ownerType}:${loc.ownerId}:${loc.workspaceId ?? ''}:${dir}`

export function put(loc: LocationRef, dir: string, files: Record<string, string>): void {
  disk.set(key(loc, dir), Object.entries(files).map(([path, text]) => ({ path, content: Buffer.from(text, 'utf-8') })))
}

export function get(loc: LocationRef, dir: string): Record<string, string> | undefined {
  const files = disk.get(key(loc, dir))
  return files && Object.fromEntries(files.map(f => [f.path, f.content.toString('utf-8')]))
}

export async function scanOnSite(loc: LocationRef, agentId: string): Promise<LocationScanSkillsResult> {
  const prefix = `${loc.ownerType}:${loc.ownerId}::`
  const skills: ScannedSkill[] = []
  for (const [k, files] of disk) {
    if (!k.startsWith(prefix)) continue
    const dir = k.slice(prefix.length)
    const place = dir.match(/^\.agents\/skills\/([^/]+)$/)
    const agent = dir.match(/^\.agents\/agents\/([^/]+)\/skills\/([^/]+)$/)
    const base = { fingerprint: fingerprintOf(files), name: '', description: '' }
    if (place) skills.push({ ...base, group: 'place', path: place[1] })
    else if (agent && agent[1] === agentId) skills.push({ ...base, group: 'agent', agentId, path: agent[2] })
  }
  return { skills, problems: [], truncated: false }
}

export async function readSkillFolder(loc: LocationRef, dir: string): Promise<PackageFile[]> {
  return [...(disk.get(key(loc, dir)) ?? [])].sort((a, b) => (a.path < b.path ? -1 : 1))
}

export async function writeSkillFolder(loc: LocationRef, dir: string, files: PackageFile[]): Promise<void> {
  if (site.failWrites) throw new LifecycleError('This HQ can\'t write a skill\'s files to its site yet. Nothing was changed.', 409)
  disk.set(key(loc, dir), files.map(f => ({ path: f.path, content: Buffer.from(f.content) })))
}

export async function removeSkillFolder(loc: LocationRef, dir: string): Promise<void> {
  if (site.failWrites) throw new LifecycleError('This HQ can\'t write a skill\'s files to its site yet. Nothing was changed.', 409)
  disk.delete(key(loc, dir))
}
