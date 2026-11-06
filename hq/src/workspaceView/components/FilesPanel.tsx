import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useQuery, getGitTree } from 'wasp/client/operations'
import type { BranchFileChange, GitTreeEntry } from '@agenthix/core'
import { ChangeMarker } from '@agenthix/ui/files'
import type { BranchRef, GitTreeView } from '../../branches/views'
import { useOnWorkspaceChange } from '../hooks/useWorkspaceLive'
import { MARK_HINT, baseName, changedFolders, changesByPath, deletedIn, markerStatus, onlyChangedIn } from './changeMarks'

interface TreeProps {
  workspaceId: string
  gitRef: BranchRef
  /** The changes marked in the tree: the branch's against its base, or an older version's own; empty for none. */
  changes: readonly BranchFileChange[]
  /** *Only changed*: the changed files and the folders that hold them, nothing else. */
  onlyChanged: boolean
  selected: string | null
  onOpenFile: (path: string) => void
  /** Each folder's entries as they are listed, for *Open a file…*. */
  onListed?: (entries: readonly GitTreeEntry[]) => void
}

/**
 * The one file tree (board *Files and changes, one view*): the files as they are on the branch or version in view,
 * tracked files only, folders first, each change marked A, M, ✕ or R with its meaning on hover. A deleted file stays
 * listed where it was, struck through, and opens like any other. A folder holding a change has a dot and starts open.
 * *Only changed* narrows the same tree to the changes, read from them alone.
 */
export function FilesPanel(p: TreeProps) {
  const byPath = useMemo(() => changesByPath(p.changes), [p.changes])
  const dotted = useMemo(() => changedFolders(p.changes), [p.changes])
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map())
  const isOpen = (path: string) => toggled.get(path) ?? (p.onlyChanged || dotted.has(path))
  const toggle = (path: string) => setToggled(prev => new Map(prev).set(path, !isOpen(path)))
  const shared = { ...p, byPath, dotted, isOpen, toggle }
  return (
    <div role="tree" aria-label="Files" className="py-1" data-testid="files-tree">
      {p.onlyChanged ? <ChangedFolder {...shared} path="" depth={0} /> : <Folder {...shared} path="" depth={0} />}
    </div>
  )
}

type Shared = TreeProps & {
  byPath: Map<string, BranchFileChange>
  dotted: Set<string>
  isOpen: (path: string) => boolean
  toggle: (path: string) => void
}

const pad = (depth: number): CSSProperties => ({ paddingLeft: 10 + depth * 14 })
const rowClass = (on: boolean) =>
  `flex w-full items-center gap-1.5 py-1 pr-2 text-left text-small hover:bg-surface-hover ${on ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`

function FolderRow({ s, path, name, depth, children }: { s: Shared; path: string; name: string; depth: number; children: ReactNode }) {
  const open = s.isOpen(path)
  return (
    <li role="treeitem" aria-expanded={open} aria-selected={false}>
      <button type="button" style={pad(depth)} className={rowClass(false)} onClick={() => s.toggle(path)}>
        {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {s.dotted.has(path) && <span role="img" aria-label="holds changes" title="Holds changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
      </button>
      {open && children}
    </li>
  )
}

function FileRow({ s, path, depth }: { s: Shared; path: string; depth: number }) {
  const change = s.byPath.get(path)
  const gone = change?.status === 'deleted'
  return (
    <li role="treeitem" aria-selected={s.selected === path}>
      <button type="button" style={pad(depth)} className={rowClass(s.selected === path)} onClick={() => s.onOpenFile(path)}>
        <span className="w-[13px]" aria-hidden />
        <span className={`min-w-0 flex-1 truncate ${gone ? 'text-text-muted line-through' : ''}`}>{baseName(path)}</span>
        {change && <span title={MARK_HINT[change.status]}><ChangeMarker status={markerStatus(change.status)} /></span>}
      </button>
    </li>
  )
}

function Folder(s: Shared & { path: string; depth: number }) {
  const { workspaceId, gitRef, path, depth, onListed } = s
  const { data, error, refetch } = useQuery(getGitTree, { workspaceId, ref: gitRef, path })
  useOnWorkspaceChange(refetch)
  const tree = data as GitTreeView | undefined
  useEffect(() => { if (tree) onListed?.(tree.entries) }, [tree, onListed])
  if (error) return depth === 0 ? <p role="status" className="px-3 py-2 text-small text-text-muted">Could not list the files: {error.message}</p> : null
  if (!tree) return depth === 0 ? <p className="px-3 py-2 text-small text-text-muted">Loading…</p> : null
  const gone = deletedIn(s.changes, path)
  if (tree.entries.length === 0 && gone.length === 0 && depth === 0) return <p className="px-3 py-2 text-small text-text-muted">No files yet.</p>
  return (
    <ul role="group">
      {tree.entries.map(e => (e.kind === 'dir' ? (
        <FolderRow key={e.path} s={s} path={e.path} name={e.name} depth={depth}>
          <Folder {...s} path={e.path} depth={depth + 1} />
        </FolderRow>
      ) : <FileRow key={e.path} s={s} path={e.path} depth={depth} />))}
      {gone.map(f => <FileRow key={f.path} s={s} path={f.path} depth={depth} />)}
      {tree.overflow && depth === 0 && <li className="px-3 py-1 text-micro text-text-muted">Only the first entries are listed.</li>}
    </ul>
  )
}

function ChangedFolder(s: Shared & { path: string; depth: number }) {
  const { folders, files } = onlyChangedIn(s.changes, s.path)
  if (s.depth === 0 && folders.length === 0 && files.length === 0) return <p className="px-3 py-2 text-small text-text-muted">Nothing changed.</p>
  return (
    <ul role="group">
      {folders.map(f => (
        <FolderRow key={f} s={s} path={f} name={baseName(f)} depth={s.depth}>
          <ChangedFolder {...s} path={f} depth={s.depth + 1} />
        </FolderRow>
      ))}
      {files.map(f => <FileRow key={f.path} s={s} path={f.path} depth={s.depth} />)}
    </ul>
  )
}
