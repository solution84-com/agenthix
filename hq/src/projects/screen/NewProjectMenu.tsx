import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

const ITEM = 'block w-full rounded-md px-2.5 py-2 text-left text-body text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'

/**
 * ＋ New project ▾ (every screen reviewed spec §3): the button makes a project; its arrow offers a board, a
 * workspace or a routine, each of which asks for its project (or place) first.
 */
export function NewProjectMenu({ noSite, onNewProject, onNewBoard, onNewWorkspace, onNewRoutine }: {
  noSite: boolean
  onNewProject: () => void
  onNewBoard: () => void
  onNewWorkspace: () => void
  onNewRoutine: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const choose = (go: () => void) => () => { setOpen(false); go() }
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button" disabled={noSite} onClick={onNewProject}
        className="flex items-center gap-1.5 rounded-l-lg bg-accent px-4 py-2 text-body font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={14} aria-hidden /> New project
      </button>
      <button
        type="button" aria-label="More ways to add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="rounded-r-lg border-l border-on-accent/30 bg-accent px-2 text-on-accent transition-colors hover:bg-accent-hover"
      >
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1.5 w-64 rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg">
          <button type="button" role="menuitem" disabled={noSite} className={ITEM} onClick={choose(onNewProject)}>New project</button>
          <hr className="my-1 border-border-subtle" />
          <button type="button" role="menuitem" className={ITEM} onClick={choose(onNewBoard)}>
            New board…<small className="block text-micro text-text-muted">Pick its project, then name it</small>
          </button>
          <button type="button" role="menuitem" disabled={noSite} className={ITEM} onClick={choose(onNewWorkspace)}>
            New workspace…<small className="block text-micro text-text-muted">Pick its place — a project or Chat — then name it</small>
          </button>
          <button type="button" role="menuitem" className={ITEM} onClick={choose(onNewRoutine)}>
            New routine…<small className="block text-micro text-text-muted">Pick its place — a project or Chat — then say what and when</small>
          </button>
        </div>
      )}
    </div>
  )
}
