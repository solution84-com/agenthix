import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronDown, Plus } from 'lucide-react'
import type { LibraryAssets } from '../assetList/types'
import { LIBRARY_ADD_PATH, LIBRARY_NEW_SKILL_PATH } from './libraryRoutes'

type Way = { label: string; hint: string; to: string }

/** The ways in, for what this person may do: New skill makes one; the others bring something in. */
export function addWays(can: Pick<LibraryAssets, 'mayMake' | 'mayAddFromAgenthix' | 'mayAddFromOutside'>): Way[] {
  return [
    ...(can.mayMake ? [{ label: 'New skill', hint: 'Write one here, with the editor', to: LIBRARY_NEW_SKILL_PATH }] : []),
    ...(can.mayAddFromAgenthix ? [{ label: 'From Agenthix', hint: 'Skills, agents, boards and teams that ship with this HQ', to: `${LIBRARY_ADD_PATH}?from=shelf` }] : []),
    ...(can.mayAddFromOutside ? [
      { label: 'Upload a package', hint: 'A ZIP or a skill folder', to: `${LIBRARY_ADD_PATH}?from=upload` },
      { label: 'From a link', hint: 'A ZIP on any web server', to: `${LIBRARY_ADD_PATH}?from=link` },
    ] : []),
  ]
}

/** ＋ Add ▾: the one way in to add or make anything. On a phone it sits at the foot of the list, so it opens upward. */
export function LibraryAddMenu({ ways, up = false }: { ways: Way[]; up?: boolean }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [open])
  if (ways.length === 0) return null
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-button bg-accent px-4 py-2 text-body font-button text-on-accent shadow-primary transition-colors hover:bg-accent-hover"
      >
        <Plus size={14} aria-hidden /> Add <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className={`absolute right-0 z-20 w-64 rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
          {ways.map(w => (
            <button
              key={w.label} type="button" role="menuitem" onClick={() => { setOpen(false); navigate(w.to) }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-body text-text-primary hover:bg-surface-hover"
            >
              {w.label}
              <small className="block text-micro text-text-muted">{w.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
