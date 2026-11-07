import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Search } from 'lucide-react'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { useQuery, getPins, getProjects } from 'wasp/client/operations'
import type { PlaceNav } from '../../layouts/placeNavTypes'
import { findProjectGroups, projectAt, type PinRef, type ProjectChoice } from './projectChoices'

/**
 * Find a project: a search, the person's pinned projects first, then the others, and a way to all projects. Choosing
 * one lands on the same section of it. The project shown is marked *here*.
 */
export function FindProjectList({ nav, onChoose }: { nav: PlaceNav; onChoose: () => void }) {
  const { data: projectData } = useQuery(getProjects)
  const { data: pinData } = useQuery(getPins)
  const [search, setSearch] = useState('')
  const { pinned, others } = findProjectGroups((projectData ?? []) as ProjectChoice[], (pinData ?? []) as PinRef[], search)
  const here = (p: ProjectChoice) => nav.kind === 'project' && nav.id === p.id

  const group = (heading: string, rows: ProjectChoice[]) => rows.length > 0 && (
    <section aria-label={heading} className="py-1">
      <h3 className="px-3 pt-1 pb-0.5 text-micro font-medium uppercase tracking-wide text-text-muted">{heading}</h3>
      {rows.map((p) => (
        <Link
          key={p.id}
          to={projectAt(p.key, nav.current)}
          onClick={onChoose}
          aria-current={here(p) ? 'page' : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 text-body text-text-primary hover:bg-surface-hover ${here(p) ? 'bg-accent-subtle' : ''}`}
        >
          <PlaceAvatar kind="project" id={p.id} name={p.name} size="sm" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
          {here(p) && <span className="shrink-0 text-small text-text-muted">here</span>}
        </Link>
      ))}
    </section>
  )

  return (
    <div className="flex min-h-0 flex-col">
      <label className="relative mx-3 my-2 block shrink-0">
        <span className="sr-only">Find a project</span>
        <Search size={13} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a project"
          className="w-full rounded-lg border border-border-subtle bg-surface-1 py-1.5 pl-8 pr-2.5 text-small text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {group('Pinned', pinned)}
        {group('Other projects', others)}
        {!pinned.length && !others.length && <p className="px-3 py-2 text-small text-text-muted">No project matches.</p>}
      </div>
      <Link to="/projects" onClick={onChoose} className="shrink-0 border-t border-border-subtle px-3 py-2 text-small text-accent hover:text-accent-hover">
        All projects →
      </Link>
    </div>
  )
}

/** A button (a project's name ▾) that opens Find a project under it; a click outside or Esc closes it, and focus returns. */
export function FindProjectButton({ nav, label, className, children }: {
  nav: PlaceNav
  label: string
  className: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); opener.current?.focus() }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); opener.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <span className="relative min-w-0">
      <button ref={opener} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={className}>
        {children}
      </button>
      {open && (
        <>
          <div data-testid="find-project-outside" className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Find a project" className="absolute left-0 top-full z-40 mt-1 flex max-h-[70vh] w-64 flex-col rounded-xl border border-border bg-surface-1 shadow-lg">
            <FindProjectList nav={nav} onChoose={close} />
          </div>
        </>
      )}
    </span>
  )
}
