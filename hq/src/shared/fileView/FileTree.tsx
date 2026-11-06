import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { ChangeMarker, type ChangeStatus } from '@agenthix/ui/files'
import { baseName, foldersOf, pathTree, type TreeFolder } from './pathTree'

/** A file's change, as the tree marks it: its marker and, for text, the lines added and removed. */
export type TreeMark = { status: ChangeStatus; added?: number; removed?: number }

const HINT: Record<ChangeStatus, string> = { added: 'New', modified: 'Changed', removed: 'Deleted: still listed so it can be opened', renamed: 'Renamed' }

export interface FileTreeProps {
  /** Every file listed, a deleted one included; *Only changed* is the caller's narrower list. */
  paths: readonly string[]
  marks?: ReadonlyMap<string, TreeMark>
  selected: string | null
  onOpen: (path: string) => void
  /** What a file's row offers beside its name, shown on hover and focus: Rename, Delete, Undo. */
  actions?: (path: string) => ReactNode
  /** Rows a phone taps: taller, and the name in the body size. */
  roomy?: boolean
  label?: string
}

const pad = (depth: number): CSSProperties => ({ paddingLeft: 10 + depth * 14 })

type Ctx = Pick<FileTreeProps, 'marks' | 'selected' | 'onOpen' | 'actions'> & {
  shut: Set<string>
  toggle: (path: string) => void
  row: string
  dotted: Set<string>
}

function Folder({ folder, depth, c }: { folder: TreeFolder; depth: number; c: Ctx }) {
  const { shut, toggle, row, dotted, marks, selected, onOpen, actions } = c
  return (
    <ul role="group">
      {folder.folders.map(f => {
        const open = !shut.has(f.path)
        return (
          <li key={f.path} role="treeitem" aria-expanded={open} aria-selected={false}>
            <button type="button" style={pad(depth)} className={`${row} text-text-secondary`} onClick={() => toggle(f.path)}>
              {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
              <span className="min-w-0 flex-1 truncate">{f.name}/</span>
              {dotted.has(f.path) && <span role="img" aria-label="holds changes" title="Holds changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
            </button>
            {open && <Folder folder={f} depth={depth + 1} c={c} />}
          </li>
        )
      })}
      {folder.files.map(path => {
        const mark = marks?.get(path)
        const on = selected === path
        return (
          <li key={path} role="treeitem" aria-selected={on} className={`group flex items-center ${on ? 'bg-surface-2' : ''}`}>
            <button type="button" style={pad(depth)} data-testid="tree-file" aria-current={on ? 'true' : undefined} title={path}
              className={`${row} min-w-0 flex-1 ${on ? 'text-text-primary' : 'text-text-secondary'}`} onClick={() => onOpen(path)}>
              <span className="w-[13px] shrink-0" aria-hidden />
              <span className={`min-w-0 flex-1 truncate ${mark?.status === 'removed' ? 'text-text-muted line-through' : ''}`}>{baseName(path)}</span>
              {mark && (mark.added || mark.removed) ? (
                <span className="font-mono text-micro text-text-muted">{mark.added ? `+${mark.added}` : ''}{mark.added && mark.removed ? ' ' : ''}{mark.removed ? `−${mark.removed}` : ''}</span>
              ) : null}
              {mark && <span title={HINT[mark.status]}><ChangeMarker status={mark.status} /></span>}
            </button>
            {actions && <span className="hidden shrink-0 gap-0.5 pr-1 group-hover:flex group-focus-within:flex">{actions(path)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A folder's files as a tree, as the workspace view's file tree draws them: folders first and open, a folder that
 * holds a change dotted, each change marked A, M, ✕ or R with its meaning on hover, a deleted file struck through
 * and still opened. Drawn from a list of paths held in the page, so it serves a skill's files, at any version or as a
 * draft.
 */
export function FileTree({ paths, marks, selected, onOpen, actions, roomy = false, label = 'Files' }: FileTreeProps) {
  const tree = useMemo(() => pathTree(paths), [paths])
  const dotted = useMemo(() => foldersOf(marks?.keys() ?? []), [marks])
  const [shut, setShut] = useState<Set<string>>(new Set())
  const toggle = (path: string) => setShut(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next })
  const row = `flex w-full items-center gap-1.5 pr-2 text-left hover:bg-surface-hover ${roomy ? 'min-h-11 py-2 text-body' : 'py-1 text-small'}`

  return (
    <div role="tree" aria-label={label} className="py-1" data-testid="file-tree">
      {paths.length === 0 ? <p className="px-3 py-2 text-small text-text-muted">Nothing changed.</p> : <Folder folder={tree} depth={0} c={{ shut, toggle, row, dotted, marks, selected, onOpen, actions }} />}
    </div>
  )
}
