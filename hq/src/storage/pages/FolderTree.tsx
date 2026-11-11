import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { EntryIcon, joinPath, visibleEntries, type ListedEntry } from '@agenthix/ui/projects'
import { useFolder, type Target } from './filesToolData'
import { FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import { ReadNudge, useSiteRead } from '../../shared/siteRead'

/** The folders on the way to a file: `a/b/c.md` is in `a` and `a/b`. */
export function foldersTo(path: string | null): string[] {
  const parts = (path ?? '').split('/').filter(Boolean).slice(0, -1)
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
}

/** A tree's order (M3): folders first, then files, each by name as a person reads it. */
export function treeOrder(entries: readonly ListedEntry[]): ListedEntry[] {
  return [...entries].sort((a, b) => Number(!!b.isDir) - Number(!!a.isDir) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

interface Shared {
  target: Target
  selected: string | null
  open: ReadonlySet<string>
  toggle: (path: string) => void
  onOpenFile: (path: string) => void
}

/**
 * A location's folders as a tree (wide Files, a workspace's files): each folder opening in place beneath itself,
 * folders first and then files by name, each with its icon. The open file is marked with the selected fill, the folders
 * on its way start open, and it is scrolled into view (S4).
 */
export function FolderTree({ target, selected, onOpenFile }: {
  target: Target
  selected: string | null
  onOpenFile: (path: string) => void
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(foldersTo(selected)))
  // A file opened from elsewhere (a link, the viewer) opens its folders too; folders the person closed stay closed.
  useEffect(() => {
    const wanted = foldersTo(selected)
    setOpen(prev => (wanted.every(f => prev.has(f)) ? prev : new Set([...prev, ...wanted])))
  }, [selected])
  const toggle = (path: string) => setOpen(prev => {
    const next = new Set(prev)
    if (!next.delete(path)) next.add(path)
    return next
  })
  return <Level s={{ target, selected, open, toggle, onOpenFile }} path="" depth={0} />
}

function Level({ s, path, depth }: { s: Shared; path: string; depth: number }) {
  const folder = useFolder(s.target, path)
  const read = useSiteRead(folder, { what: 'This folder' })
  const { data } = folder
  // Only the top level speaks: a deeper folder that could not be read stays closed, as one still loading does.
  if (read.failedWithoutData) return depth === 0 ? <ReadNudge read={read} /> : null
  if (!data) return depth === 0 ? <p className="px-4 py-3 text-small text-text-muted">Loading…</p> : null
  const rows = treeOrder(visibleEntries(data))
  if (rows.length === 0 && depth === 0) {
    return <p className="px-4 py-3 text-small text-text-muted">No files yet. Ask an agent to write one, for example “put this in specs”.</p>
  }
  return (
    <>
      {depth === 0 && <ReadNudge read={read} />}
      <ul className={depth === 0 ? 'px-2' : undefined}>
        {rows.map(e => {
          const full = joinPath(path, e.name)
          return (
            <li key={e.name}>
              <TreeRow s={s} entry={e} full={full} depth={depth} />
              {e.isDir && s.open.has(full) && <Level s={s} path={full} depth={depth + 1} />}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function TreeRow({ s, entry, full, depth }: { s: Shared; entry: ListedEntry; full: string; depth: number }) {
  const row = useRef<HTMLButtonElement>(null)
  const chosen = s.selected === full
  useEffect(() => {
    if (chosen) row.current?.scrollIntoView?.({ block: 'nearest' })
  }, [chosen])
  const isOpen = s.open.has(full)
  return (
    <button
      ref={row}
      type="button"
      onClick={() => (entry.isDir ? s.toggle(full) : s.onOpenFile(full))}
      aria-current={chosen ? 'true' : undefined}
      aria-expanded={entry.isDir ? isOpen : undefined}
      style={{ paddingLeft: 12 + depth * 14 }}
      className={`flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-3 text-left text-small ${FOCUS_RING_INSET} ${chosen ? ROW_CHOSEN : ROW_ITEM}`}
    >
      {entry.isDir
        ? (isOpen ? <ChevronDown size={13} aria-hidden className="shrink-0" /> : <ChevronRight size={13} aria-hidden className="shrink-0" />)
        : <span className="w-[13px] shrink-0" aria-hidden />}
      <EntryIcon name={entry.name} isDir={entry.isDir} />
      <span className="truncate">{entry.name}</span>
    </button>
  )
}
