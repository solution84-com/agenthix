import { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'

const SHOWN = 8

/** The paths that match what was typed: those whose name starts with it first, then any that hold it. */
export function matchesOf(paths: readonly string[], typed: string): string[] {
  const q = typed.trim().toLowerCase()
  if (!q) return []
  const name = (p: string) => (p.split('/').pop() ?? p).toLowerCase()
  const starts = paths.filter(p => name(p).startsWith(q))
  const holds = paths.filter(p => !starts.includes(p) && p.toLowerCase().includes(q))
  return [...starts, ...holds].slice(0, SHOWN)
}

/**
 * *⌕ Open a file…* above the tree: typing lists the files the tree has listed so far and the changed ones, by name;
 * Enter opens the first, or the path as typed when it names none of them.
 */
export function OpenAFile({ paths, onOpen }: { paths: readonly string[]; onOpen: (path: string) => void }) {
  const [typed, setTyped] = useState('')
  const listId = useId()
  const found = useMemo(() => matchesOf(paths, typed), [paths, typed])
  const open = (path: string) => { setTyped(''); onOpen(path) }
  const asTyped = typed.trim().replace(/^\/+/, '')
  return (
    <div className="relative px-2 pt-2">
      <label className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 px-2 py-1 text-small text-text-secondary focus-within:border-accent">
        <Search size={13} aria-hidden />
        <input type="search" value={typed} placeholder="Open a file…" aria-label="Open a file" aria-controls={listId}
          className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') setTyped('')
            if (e.key === 'Enter' && asTyped) open(found[0] ?? asTyped)
          }} />
      </label>
      {asTyped && (
        <ul id={listId} role="listbox" aria-label="Files that match"
          className="absolute left-2 right-2 top-full z-20 mt-1 rounded-lg border border-border bg-surface-1 py-1 shadow-lg">
          {found.map(p => (
            <li key={p} role="option" aria-selected={false}>
              <button type="button" onClick={() => open(p)} className="block w-full truncate px-2 py-1 text-left font-mono text-small text-text-primary hover:bg-surface-hover">{p}</button>
            </li>
          ))}
          {found.length === 0 && (
            <li role="option" aria-selected={false}>
              <button type="button" onClick={() => open(asTyped)} className="block w-full truncate px-2 py-1 text-left text-small text-text-secondary hover:bg-surface-hover">
                Open <span className="font-mono text-text-primary">{asTyped}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
