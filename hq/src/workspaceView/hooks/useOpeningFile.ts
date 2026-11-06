import { useQuery, getGitTree } from 'wasp/client/operations'
import type { BranchFileChange } from '@agenthix/core'
import { visibleEntries } from '@agenthix/ui/projects'
import type { BranchRef, GitTreeView } from '../../branches/views'
import { useFolder, type Target } from '../../storage/pages/filesToolData'
import { firstChanged, openingFile } from '../components/changeMarks'

/**
 * The file the view opens on when the address names none (board *The view on a wide screen*): on a branch with
 * changes, the first changed file; otherwise the top folder's README, or its first file. Null while it is read, when
 * there is no file, or when `wanted` is false (a file is named, or a phone shows the tree first).
 */
export function useOpeningFile({ workspaceId, gitRef, changes, target, wanted }: {
  workspaceId: string
  /** The branch or version in view; null without Git. */
  gitRef: BranchRef | null
  /** The changes marked, once read; undefined while they are read. */
  changes: readonly BranchFileChange[] | undefined
  target: Target
  wanted: boolean
}): string | null {
  const changed = changes ? firstChanged(changes) : null
  const needTop = wanted && changes !== undefined && !changed
  const top = useQuery(getGitTree, { workspaceId, ref: gitRef ?? { kind: 'main' }, path: '' }, { enabled: needTop && !!gitRef })
  const plain = useFolder(target, '', needTop && !gitRef)
  if (!wanted || changes === undefined) return null
  if (changed) return changed
  if (gitRef) return openingFile((top.data as GitTreeView | undefined)?.entries ?? [])
  return openingFile(visibleEntries(plain.data ?? []).map(e => ({ name: e.name, path: e.name, kind: e.isDir ? 'dir' as const : 'file' as const })))
}
