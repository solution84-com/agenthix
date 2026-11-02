import { useQuery, getGitFile } from 'wasp/client/operations'
import type { BranchFileChange } from '@agenthix/core'
import { ChangeMarker, FileDiff } from '@agenthix/ui/files'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { GitFileView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { markerStatus } from './changeMarks'

type Side = { text: string | null; note: string | null; loading: boolean; error: Error | null }

function useSide(workspaceId: string, branchId: string, at: 'tip' | 'base', path: string | null): Side {
  const { data, error, refetch } = useQuery(getGitFile, { workspaceId, ref: { kind: 'branch', branchId }, at, path: path ?? '' }, { enabled: path !== null })
  useOnWorkspaceChange(refetch)
  if (path === null) return { text: null, note: null, loading: false, error: null }
  const view = data as GitFileView | undefined
  if (!view) return { text: null, note: null, loading: !error, error: error ?? null }
  if (!view.exists) return { text: null, note: null, loading: false, error: null }
  if (view.binary) return { text: null, note: 'A binary file: there are no lines to compare.', loading: false, error: null }
  if (view.tooLarge || view.text === null) return { text: null, note: 'Too large to compare here.', loading: false, error: null }
  return { text: view.text, note: null, loading: false, error: null }
}

/**
 * One changed file's changes in the middle (spec part 1, *Git*): the text at the branch's base against its tip, in
 * HQ's existing diff view. An added file has no base side, a deleted one no tip side; a renamed one is read under its
 * old path at the base.
 */
export function DiffMiddle({ workspaceId, branchId, change, baseVersion, onOpenFile }: {
  workspaceId: string
  branchId: string
  change: BranchFileChange
  /** The version of main the changes are compared with; null when it is none of main's. */
  baseVersion: number | null
  /** Opens the file itself; absent for a deleted file. */
  onOpenFile?: () => void
}) {
  const basePath = change.status === 'added' ? null : change.from ?? change.path
  const tipPath = change.status === 'deleted' ? null : change.path
  const before = useSide(workspaceId, branchId, 'base', basePath)
  const after = useSide(workspaceId, branchId, 'tip', tipPath)
  const failed = before.error ?? after.error
  const note = before.note ?? after.note

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2 text-small text-text-secondary">
        <ChangeMarker status={markerStatus(change.status)} added={change.additions ?? 0} removed={change.deletions ?? 0} />
        <b className="font-mono text-text-primary">{change.path}</b>
        {change.from && <span className="text-text-muted">from {change.from}</span>}
        <span>· changes compared with main{baseVersion !== null && ` at v${baseVersion}`}</span>
        {change.additions !== null && (
          <span className="font-mono"><span className="text-success">+{change.additions}</span> <span className="text-danger">−{change.deletions ?? 0}</span></span>
        )}
        {onOpenFile && <button type="button" onClick={onOpenFile} className="ml-auto text-accent hover:underline">Open the file</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 py-2" data-testid="workspace-diff">
        {failed ? <FilesQuietLine role="status">{failed.message}</FilesQuietLine>
          : note ? <FilesQuietLine role="status">{note}</FilesQuietLine>
          : before.loading || after.loading ? <FilesQuietLine>Loading…</FilesQuietLine>
          : <FileDiff before={before.text} after={after.text} />}
      </div>
    </div>
  )
}
