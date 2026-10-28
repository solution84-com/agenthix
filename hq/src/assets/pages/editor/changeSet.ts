/**
 * What differs between the version in use and what is being edited, file by file (board U3b, *The change markers*):
 * A added, M modified, ✕ deleted (still listed until published or undone), R renamed with its old name. A rename is
 * one the person made in this session, or a removed and an added file holding the same bytes.
 */
import type { ChangeStatus, FileChange } from '@agenthix/ui/files'
import { diffLines, diffStats } from '@agenthix/ui/files'
import { byPath, sameBytes, textOf, type EditorFile } from './editorFiles'


export type FileRow = {
  path: string
  /** Null: the file is as it is in the version in use. */
  status: ChangeStatus | null
  oldPath?: string
  binary: boolean
  added: number
  removed: number
}

type Side = { text: string | null; binary: boolean }

const sideOf = (bytes: Uint8Array | undefined): Side => {
  if (!bytes) return { text: null, binary: false }
  const text = textOf(bytes)
  return { text, binary: text === null }
}

/** `renames` maps a file's new path to the path it had in the version in use. */
export function changesBetween(base: readonly EditorFile[], now: readonly EditorFile[], renames: ReadonlyMap<string, string> = new Map()): FileChange[] {
  const before = new Map(base.map(f => [f.path, f.bytes]))
  const after = new Map(now.map(f => [f.path, f.bytes]))
  const paired = new Map<string, string>()
  for (const [to, from] of renames) {
    if (after.has(to) && before.has(from) && !after.has(from) && !before.has(to)) paired.set(to, from)
  }
  const goneLeft = [...before.keys()].filter(p => !after.has(p) && ![...paired.values()].includes(p))
  const added = [...after.keys()].filter(p => !before.has(p) && !paired.has(p))
  for (const to of added) {
    const bytes = after.get(to)!
    if (bytes.length === 0) continue
    const at = goneLeft.findIndex(from => sameBytes(before.get(from)!, bytes))
    if (at >= 0) paired.set(to, goneLeft.splice(at, 1)[0]!)
  }
  const out: FileChange[] = []
  for (const [path, bytes] of after) {
    const from = paired.get(path)
    if (from) {
      const b = sideOf(before.get(from))
      const a = sideOf(bytes)
      out.push({ path, status: 'renamed', oldPath: from, before: b.text, after: a.text, binary: a.binary || b.binary })
    } else if (!before.has(path)) {
      const a = sideOf(bytes)
      out.push({ path, status: 'added', before: null, after: a.text, binary: a.binary })
    } else if (!sameBytes(before.get(path)!, bytes)) {
      const b = sideOf(before.get(path))
      const a = sideOf(bytes)
      out.push({ path, status: 'modified', before: b.text, after: a.text, binary: a.binary || b.binary })
    }
  }
  for (const path of before.keys()) {
    if (after.has(path) || [...paired.values()].includes(path)) continue
    const b = sideOf(before.get(path))
    out.push({ path, status: 'removed', before: b.text, after: null, binary: b.binary })
  }
  return out.sort(byPath)
}

const statsOf = (c: FileChange) => (c.binary ? { added: 0, removed: 0 } : diffStats(diffLines(c.before ?? '', c.after ?? '')))

/** Every file of the tree: the files now, then the removed ones, each with its marker and line counts. */
export function treeRows(base: readonly EditorFile[], now: readonly EditorFile[], renames?: ReadonlyMap<string, string>): FileRow[] {
  const changes = new Map(changesBetween(base, now, renames).map(c => [c.path, c]))
  const rows: FileRow[] = []
  const paths = new Set([...now.map(f => f.path), ...[...changes.values()].filter(c => c.status === 'removed').map(c => c.path)])
  for (const path of paths) {
    const c = changes.get(path)
    const stats = c ? statsOf(c) : { added: 0, removed: 0 }
    rows.push({ path, status: c?.status ?? null, oldPath: c?.oldPath, binary: c?.binary ?? false, ...stats })
  }
  return rows.sort(byPath)
}

export const countChanged = (changes: readonly FileChange[]) => ({
  added: changes.filter(c => c.status === 'added').length,
  modified: changes.filter(c => c.status === 'modified').length,
  removed: changes.filter(c => c.status === 'removed').length,
  renamed: changes.filter(c => c.status === 'renamed').length,
})

/** "4 files changed: 1 added, 2 modified, 1 deleted". */
export function changeSummary(changes: readonly FileChange[]): string {
  if (changes.length === 0) return 'No files changed'
  const n = countChanged(changes)
  const parts = [
    n.added && `${n.added} added`, n.modified && `${n.modified} modified`,
    n.renamed && `${n.renamed} renamed`, n.removed && `${n.removed} deleted`,
  ].filter(Boolean)
  return `${changes.length} ${changes.length === 1 ? 'file' : 'files'} changed: ${parts.join(', ')}`
}
