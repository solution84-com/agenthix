import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { filterByName, joinPath, newestFirst, visibleEntries } from '@agenthix/ui/projects'
import { useFolder, type Target } from './filesToolData'

/** One folder's entries, newest first, each folder opening in place beneath itself (wide Files, a workspace's files). */
export function FolderTree({ target, path = '', depth = 0, query = '', selected, onOpenFile }: {
  target: Target
  path?: string
  depth?: number
  query?: string
  selected: string | null
  onOpenFile: (path: string) => void
}) {
  const { data, error } = useFolder(target, path)
  const [open, setOpen] = useState<Set<string>>(new Set())
  if (error) return depth === 0 ? <p role="status" className="px-4 py-3 text-small text-text-muted">Could not list this folder: {error.message}</p> : null
  if (!data) return null
  const rows = newestFirst(filterByName(visibleEntries(data), depth === 0 ? query : ''))
  if (rows.length === 0 && depth === 0) return <p className="px-4 py-3 text-small text-text-muted">Nothing here yet.</p>

  const toggle = (name: string) => setOpen(prev => {
    const next = new Set(prev)
    if (!next.delete(name)) next.add(name)
    return next
  })

  return (
    <ul>
      {rows.map(e => {
        const full = joinPath(path, e.name)
        return (
          <li key={e.name}>
            <button
              type="button"
              onClick={() => (e.isDir ? toggle(e.name) : onOpenFile(full))}
              aria-current={selected === full ? 'true' : undefined}
              aria-expanded={e.isDir ? open.has(e.name) : undefined}
              style={{ paddingLeft: 12 + depth * 14 }}
              className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-small hover:bg-surface-hover ${selected === full ? 'bg-surface-2 text-text-primary' : 'text-text-secondary'}`}
            >
              {e.isDir
                ? (open.has(e.name) ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />)
                : <span className="w-[13px]" aria-hidden />}
              <span className="truncate">{e.name}</span>
            </button>
            {e.isDir && open.has(e.name) && (
              <FolderTree target={target} path={full} depth={depth + 1} selected={selected} onOpenFile={onOpenFile} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

