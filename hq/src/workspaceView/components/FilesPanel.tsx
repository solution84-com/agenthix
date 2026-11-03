import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery, getGitTree } from 'wasp/client/operations'
import type { BranchFileChange } from '@agenthix/core'
import { ChangeMarker } from '@agenthix/ui/files'
import type { BranchRef, GitTreeView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { baseName, changesByPath, deletedIn, markerStatus } from './changeMarks'

/**
 * The chosen branch's folder tree (spec part 1, *Files*): tracked files only, folders first, each file the branch
 * added, changed or deleted marked A, M or ✕. A deleted file stays listed where it was, struck through; choosing it
 * shows its changes, since there is no file to open. A folder lists its entries when it is opened.
 */
export function FilesPanel({ workspaceId, gitRef, changes, selected, onOpenFile, onOpenChange }: {
  workspaceId: string
  gitRef: BranchRef
  /** The branch's changes against its base; empty for `main`. */
  changes: readonly BranchFileChange[]
  selected: string | null
  onOpenFile: (path: string) => void
  onOpenChange: (path: string) => void
}) {
  const byPath = changesByPath(changes)
  return (
    <div role="tree" aria-label="Files" className="py-1">
      <Folder workspaceId={workspaceId} gitRef={gitRef} path="" depth={0} changes={changes} byPath={byPath} selected={selected} onOpenFile={onOpenFile} onOpenChange={onOpenChange} />
    </div>
  )
}

function Folder({ workspaceId, gitRef, path, depth, changes, byPath, selected, onOpenFile, onOpenChange }: {
  workspaceId: string
  gitRef: BranchRef
  path: string
  depth: number
  changes: readonly BranchFileChange[]
  byPath: Map<string, BranchFileChange>
  selected: string | null
  onOpenFile: (path: string) => void
  onOpenChange: (path: string) => void
}) {
  const { data, error, refetch } = useQuery(getGitTree, { workspaceId, ref: gitRef, path })
  useOnWorkspaceChange(refetch)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const tree = data as GitTreeView | undefined
  if (error) return depth === 0 ? <p role="status" className="px-3 py-2 text-small text-text-muted">Could not list the files: {error.message}</p> : null
  if (!tree) return depth === 0 ? <p className="px-3 py-2 text-small text-text-muted">Loading…</p> : null
  const gone = deletedIn(changes, path)
  if (tree.entries.length === 0 && gone.length === 0 && depth === 0) return <p className="px-3 py-2 text-small text-text-muted">No files yet.</p>
  const pad = { paddingLeft: 10 + depth * 14 }
  const toggle = (p: string) => setOpen(prev => { const next = new Set(prev); if (!next.delete(p)) next.add(p); return next })
  const row = (on: boolean) =>
    `flex w-full items-center gap-1.5 py-1 pr-2 text-left text-small hover:bg-surface-hover ${on ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`

  return (
    <ul role="group">
      {tree.entries.map(e => {
        const change = byPath.get(e.path)
        return (
          <li key={e.path} role="treeitem" aria-expanded={e.kind === 'dir' ? open.has(e.path) : undefined} aria-selected={selected === e.path}>
            <button type="button" style={pad} className={row(selected === e.path)} onClick={() => (e.kind === 'dir' ? toggle(e.path) : onOpenFile(e.path))}>
              {e.kind === 'dir'
                ? (open.has(e.path) ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />)
                : <span className="w-[13px]" aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              {change && <ChangeMarker status={markerStatus(change.status)} />}
            </button>
            {e.kind === 'dir' && open.has(e.path) && (
              <Folder workspaceId={workspaceId} gitRef={gitRef} path={e.path} depth={depth + 1} changes={changes} byPath={byPath} selected={selected} onOpenFile={onOpenFile} onOpenChange={onOpenChange} />
            )}
          </li>
        )
      })}
      {gone.map(f => (
        <li key={f.path} role="treeitem" aria-selected={selected === f.path}>
          <button type="button" style={pad} className={row(selected === f.path)} onClick={() => onOpenChange(f.path)}>
            <span className="w-[13px]" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text-muted line-through">{baseName(f.path)}</span>
            <ChangeMarker status="removed" />
          </button>
        </li>
      ))}
      {tree.overflow && depth === 0 && <li className="px-3 py-1 text-micro text-text-muted">Only the first entries are listed.</li>}
    </ul>
  )
}
