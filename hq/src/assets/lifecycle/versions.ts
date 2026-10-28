/**
 * Versions (spec part 2 *Versions* V1–V3; adr-0157): SemVer order, the next version a publish makes, the rule for
 * which way the pin may move, and what changed between two versions' files. Pure.
 */
import { compareSemVer, parseSemVer } from '@agenthix/core'
import type { PackageFile } from '../../library/packages/packageZip'

const NOTHING = 'Nothing was changed.'
const FIRST_VERSION = '1.0.0'

export const BUMPS = ['patch', 'minor', 'major'] as const
export type Bump = (typeof BUMPS)[number]

export const bySemVerDescending = (a: string, b: string): number => compareSemVer(b, a)

/** The version a publish makes: the publisher's step up from the newest version held, so it never names one that exists. */
export function nextVersion(held: string[], bump: Bump): string {
  const newest = [...held].sort(bySemVerDescending)[0]
  const v = newest ? parseSemVer(newest) : null
  if (!v) return FIRST_VERSION
  if (bump === 'major') return `${v.major + 1}.0.0`
  if (bump === 'minor') return `${v.major}.${v.minor + 1}.0`
  return `${v.major}.${v.minor}.${v.patch + 1}`
}

export type PinMove = 'update' | 'rollBack'

/** Why the pin can't move this way, or null. An update goes forward, a roll back goes back (V2). */
export function pinMoveRefusal(move: PinMove, current: string, target: string): string | null {
  const order = compareSemVer(target, current)
  if (order === 0) return `${target} is already the one in use. ${NOTHING}`
  if (move === 'update' && order < 0) return `${target} is older than the one in use (${current}). Roll back to go to it. ${NOTHING}`
  if (move === 'rollBack' && order > 0) return `${target} is newer than the one in use (${current}). Update to go to it. ${NOTHING}`
  return null
}

export type FileChanges = { added: string[]; changed: string[]; removed: string[] }

/** Every file added, changed or removed from one version to another, by path. */
export function fileChanges(from: PackageFile[], to: PackageFile[]): FileChanges {
  const before = new Map(from.map(f => [f.path, f.content]))
  const after = new Map(to.map(f => [f.path, f.content]))
  const sorted = (paths: string[]) => paths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  return {
    added: sorted([...after.keys()].filter(p => !before.has(p))),
    changed: sorted([...after.keys()].filter(p => before.has(p) && !before.get(p)!.equals(after.get(p)!))),
    removed: sorted([...before.keys()].filter(p => !after.has(p))),
  }
}
