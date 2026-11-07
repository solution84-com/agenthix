import type { BranchFileChange, BranchFileStatus } from '@agenthix/core'
import type { ChangeStatus } from '@agenthix/ui/files'

export function markerStatus(status: BranchFileStatus): ChangeStatus {
  return status === 'deleted' ? 'removed' : status
}

/** The changes by path, for marking the tree. */
export function changesByPath(files: readonly BranchFileChange[]): Map<string, BranchFileChange> {
  return new Map(files.map(f => [f.path, f]))
}

/** The deleted files directly in `folder` ('' for the top), which the tree at the tip no longer lists. */
export function deletedIn(files: readonly BranchFileChange[], folder: string): BranchFileChange[] {
  return files.filter(f => f.status === 'deleted' && parentOf(f.path) === folder)
}

export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/')
export const baseName = (path: string) => path.split('/').pop() ?? path

export function totals(files: readonly BranchFileChange[]): { added: number; removed: number } {
  return files.reduce((t, f) => ({ added: t.added + (f.additions ?? 0), removed: t.removed + (f.deletions ?? 0) }), { added: 0, removed: 0 })
}

/** What each mark means, on hover: the board's short explanation of M, A, ✕ and R. */
export const MARK_HINT: Record<BranchFileStatus, string> = {
  modified: 'Changed', added: 'New', deleted: 'Deleted: still listed so it can be opened', renamed: 'Renamed',
}

/** Every folder that holds a change, at any depth (the tree's dot), '' left out. */
export function changedFolders(files: readonly BranchFileChange[]): Set<string> {
  const out = new Set<string>()
  for (const f of files) {
    const parts = f.path.split('/')
    for (let i = 1; i < parts.length; i++) out.add(parts.slice(0, i).join('/'))
  }
  return out
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Folders first, then files, each by name, at every level: the order the tree lists them in. */
export function treeOrder(a: string, b: string): number {
  const x = a.split('/')
  const y = b.split('/')
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue
    const xDir = i < x.length - 1
    const yDir = i < y.length - 1
    if (xDir !== yDir) return xDir ? -1 : 1
    return byName(x[i], y[i])
  }
  return x.length - y.length
}

/** The changes in the tree's order. */
export function inTreeOrder(files: readonly BranchFileChange[]): BranchFileChange[] {
  return [...files].sort((a, b) => treeOrder(a.path, b.path))
}

/** *Only changed*: what one folder holds of the changes, its sub-folders by path and its changed files, in order. */
export function onlyChangedIn(files: readonly BranchFileChange[], folder: string): { folders: string[]; files: BranchFileChange[] } {
  const prefix = folder ? `${folder}/` : ''
  const folders = new Set<string>()
  const here: BranchFileChange[] = []
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue
    const rest = f.path.slice(prefix.length).split('/')
    if (rest.length > 1) folders.add(prefix + rest[0])
    else here.push(f)
  }
  return { folders: [...folders].sort(byName), files: inTreeOrder(here) }
}

/** The file the view opens on with changes: the first changed one in the tree, one still there before a deleted one. */
export function firstChanged(files: readonly BranchFileChange[]): string | null {
  const ordered = inTreeOrder(files)
  return (ordered.find(f => f.status !== 'deleted') ?? ordered[0])?.path ?? null
}

/** The file the view opens on without changes: the top folder's README, otherwise its first file. */
export function openingFile(entries: readonly { name: string; path: string; kind: 'file' | 'dir' }[]): string | null {
  const files = entries.filter(e => e.kind === 'file')
  const readme = files.find(e => /^readme(\.[^/]*)?$/i.test(e.name))
  return (readme ?? files[0])?.path ?? null
}
