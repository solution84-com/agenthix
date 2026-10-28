import { useMemo, useState, type ReactNode } from 'react'
import { ChangeMarker, type ChangeStatus } from './changeMarker'
import { FileDiff } from './FileDiff'
import { diffLines, diffStats } from './diffLines'

export interface FileChange {
  path: string
  status: ChangeStatus
  /** A renamed file's old path. */
  oldPath?: string
  /** The text in the version compared with; null for an added file. */
  before: string | null
  /** The text now; null for a removed file. */
  after: string | null
  /** A binary file has no lines to compare: it is listed as changed. */
  binary?: boolean
}

export interface ChangesListProps {
  files: readonly FileChange[]
  /** Actions for one file (Open, Undo this file's changes, Restore): the screen supplies them. */
  actions?: (file: FileChange) => ReactNode
  /**
   * By default the list fills the height its container gives it and scrolls inside. `grow` lets it take the height of
   * its changes, for a page that scrolls as a whole.
   */
  grow?: boolean
}

const statsOf = (f: FileChange) => (f.binary ? { added: 0, removed: 0 } : diffStats(diffLines(f.before ?? '', f.after ?? '')))

function ChangeRow({ file, actions }: { file: FileChange; actions?: ChangesListProps['actions'] }) {
  const { added, removed } = useMemo(() => statsOf(file), [file])
  const removedFile = file.status === 'removed'
  const [open, setOpen] = useState(!removedFile && !file.binary)
  const showable = !file.binary && (added > 0 || removed > 0)
  return (
    <section className="rounded-lg border border-border-subtle" aria-label={file.path}>
      <header className="flex items-center gap-2 px-3 py-2">
        <ChangeMarker status={file.status} added={added} removed={removed} />
        <span className={`min-w-0 flex-1 truncate font-mono text-small ${removedFile ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
          {file.path}
          {file.status === 'renamed' && file.oldPath && <span className="text-text-muted"> ← {file.oldPath}</span>}
        </span>
        {file.binary ? (
          <span className="text-small text-text-secondary">binary file</span>
        ) : (
          <span className="font-mono text-small">
            {added > 0 && <span className="text-success">+{added}</span>}
            {added > 0 && removed > 0 && ' '}
            {removed > 0 && <span className="text-danger">−{removed}</span>}
          </span>
        )}
        {showable && (
          <button type="button" className="text-small text-accent hover:text-accent-hover" aria-expanded={open} onClick={() => setOpen(o => !o)}>
            {open ? 'Hide changes' : 'Show changes'}
          </button>
        )}
        {actions?.(file)}
      </header>
      {open && showable && (
        <div className="overflow-x-auto border-t border-border-subtle">
          <FileDiff before={file.before} after={file.after} />
        </div>
      )}
    </section>
  )
}

/** A whole asset's changes, file by file: A added, M modified, ✕ removed, R renamed with its old name. */
export function ChangesList({ files, actions, grow }: ChangesListProps) {
  if (files.length === 0) return <p className="text-small text-text-secondary">No files changed.</p>
  return (
    <div className={`flex flex-col gap-3${grow ? '' : ' min-h-0 flex-1 overflow-y-auto'}`} data-testid="changes-list">
      {files.map(f => <ChangeRow key={f.path} file={f} actions={actions} />)}
    </div>
  )
}
