/** What a proposal changes, file by file, for the diff: pure, so it is tested without a database. */
import type { PackageFile } from '../../../library/packages/packageZip'

export type ReviewFile = { path: string; text: string | null; base64: string }
export type ReviewChange = {
  path: string
  status: 'added' | 'modified' | 'removed'
  /** The text in the version in use; null for an added file. */
  before: string | null
  /** The text proposed; null for a removed file. */
  after: string | null
  binary: boolean
}

const textOf = (b: Buffer): string | null => {
  const t = b.toString('utf-8')
  return t.includes('�') ? null : t
}

export const fileViews = (files: PackageFile[]): ReviewFile[] =>
  files.map(f => ({ path: f.path, text: textOf(f.content), base64: f.content.toString('base64') }))

/** From the files in use (none for a new skill) to the proposed ones: every file, scripts included, by path. */
export function changesBetween(current: PackageFile[] | null, proposed: PackageFile[]): ReviewChange[] {
  const before = new Map((current ?? []).map(f => [f.path, f.content]))
  const after = new Map(proposed.map(f => [f.path, f.content]))
  const out: ReviewChange[] = []
  for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const b = before.get(path)
    const a = after.get(path)
    if (b && a && b.equals(a)) continue
    const bt = b ? textOf(b) : null
    const at = a ? textOf(a) : null
    const binary = (b !== undefined && bt === null) || (a !== undefined && at === null)
    out.push({ path, status: !b ? 'added' : !a ? 'removed' : 'modified', before: bt, after: at, binary })
  }
  return out
}
