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
