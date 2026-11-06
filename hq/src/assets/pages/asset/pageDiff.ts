/**
 * Two versions of an asset as the per-file texts the diff renderer draws (skills spec part 6; adr-0155). Text only: a
 * file that isn't text, or is too large to read line by line, is listed as changed without lines.
 */
import { compareSemVer, looksLikeText, TEXT_SNIFF_BYTES } from '@agenthix/core'
import type { PackageFile } from '../../../library/packages/packageZip'
import type { FileChangeView } from './pageTypes'

/** A file larger than this is not compared line by line. */
export const DIFF_TEXT_LIMIT = 256 * 1024

const isText = (f: PackageFile) => f.content.length <= DIFF_TEXT_LIMIT && looksLikeText(f.content.subarray(0, TEXT_SNIFF_BYTES))

export function diffFiles(from: PackageFile[], to: PackageFile[]): FileChangeView[] {
  const before = new Map(from.map(f => [f.path, f]))
  const after = new Map(to.map(f => [f.path, f]))
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  const out: FileChangeView[] = []
  for (const path of paths) {
    const a = before.get(path)
    const b = after.get(path)
    if (a && b && a.content.equals(b.content)) continue
    const binary = (a ? !isText(a) : false) || (b ? !isText(b) : false)
    out.push({
      path,
      status: !a ? 'added' : !b ? 'removed' : 'modified',
      before: a && !binary ? a.content.toString('utf-8') : null,
      after: b && !binary ? b.content.toString('utf-8') : null,
      binary,
    })
  }
  return out
}

/** The version just before `version` among those held, by SemVer; null for the first. */
export function versionBefore<T extends { version: string }>(held: readonly T[], version: string): T | null {
  const older = held.filter(v => compareSemVer(v.version, version) < 0)
  return older.reduce<T | null>((best, v) => (!best || compareSemVer(v.version, best.version) > 0 ? v : best), null)
}
