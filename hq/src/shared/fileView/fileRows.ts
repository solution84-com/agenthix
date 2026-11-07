import { diffLines, withContext, type DiffLine, type DiffRow } from '@agenthix/ui/files'

/** *Whole file* shows every line; *Changes only* folds the unchanged lines more than a few from a change. */
export type FileMode = 'whole' | 'changes'

const CONTEXT = 3

/**
 * A changed file's lines, its changes in place, and where each change starts (a row's index), for stepping between
 * them. A change is a run of removed and added lines together.
 */
export function fileRows(before: string | null, after: string | null, mode: FileMode): { rows: DiffRow[]; changes: number[] } {
  const lines: DiffLine[] = diffLines(before ?? '', after ?? '')
  const rows: DiffRow[] = mode === 'whole' ? lines : withContext(lines, CONTEXT)
  const changes: number[] = []
  rows.forEach((r, i) => {
    const changed = r.kind === 'add' || r.kind === 'del'
    const prev = rows[i - 1]
    if (changed && !(prev && (prev.kind === 'add' || prev.kind === 'del'))) changes.push(i)
  })
  return { rows, changes }
}

/** The change to step to from `at` (-1 before the first): the next or previous, held at the ends. */
export function stepTo(count: number, at: number, by: 1 | -1): number {
  if (count === 0) return -1
  if (at < 0) return by === 1 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, at + by))
}
