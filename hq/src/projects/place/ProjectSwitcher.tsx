import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getProjects } from 'wasp/client/operations'
import { ChevronDown } from 'lucide-react'
import { PlaceAvatar } from '@agenthix/ui/primitives'

type ProjectRow = { id: string; name: string; key: string; personalOwnerId: string | null; personalSpace?: boolean }

/** The project's name with ▾ (spec §4): a list of the person's other projects to switch to. */
export function ProjectSwitcher({ projectId, name }: { projectId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { data } = useQuery(getProjects, undefined, { enabled: open })
  // Your space is reached as Chat; the person's other personal projects are listed, marked.
  const projects: ProjectRow[] = (data ?? []).filter((p) => !p.personalSpace && p.id !== projectId)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  return (
    <div ref={box} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch project"
        className="flex max-w-full items-center gap-1 rounded-md px-1 -mx-1 hover:bg-surface-hover"
      >
        <h2 className="truncate text-h2 font-semibold text-text-primary">{name}</h2>
        <ChevronDown size={16} aria-hidden className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-xl">
          {data === undefined && <p className="px-3 py-2 text-small text-text-muted">Loading…</p>}
          {data !== undefined && projects.length === 0 && <p className="px-3 py-2 text-small text-text-muted">No other projects</p>}
          {projects.map((p) => (
            <Link
              key={p.id}
              role="menuitem"
              to={`/projects/${p.key}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-body text-text-primary hover:bg-surface-hover"
            >
              <PlaceAvatar kind="project" id={p.id} name={p.name} size="sm" />
              <span className="truncate">{p.name}</span>
              {p.personalOwnerId && <span className="ml-auto shrink-0 text-micro text-text-muted">Only you</span>}
            </Link>
          ))}
          <Link to="/projects" role="menuitem" onClick={() => setOpen(false)} className="mt-1 block border-t border-border-subtle px-2 pt-2 pb-1.5 text-small text-accent hover:text-accent-hover">
            All projects
          </Link>
        </div>
      )}
    </div>
  )
}
