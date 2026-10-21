import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown } from 'lucide-react'
import { useQuery, getPins, getProjects } from 'wasp/client/operations'
import { FOOT_LINKS, MAIN_LINKS } from '../components/sidebar/mainNav'
import type { Breadcrumb } from './ScreenBar'
import type { CrumbList, PlaceNav } from './placeNavTypes'

export interface MenuItem {
  label: string
  href: string
  count?: string
  tone?: 'needs' | 'live'
  current?: boolean
  /** The small heading this item starts. */
  heading?: string
}

const toneOf = (tone: MenuItem['tone']) => (tone === 'needs' ? 'text-warning' : tone === 'live' ? 'text-success' : 'text-text-muted')

/** A button that opens a list of places to go; a click outside or Esc closes it, and focus returns. */
export function CrumbMenu({ label, menuLabel, button, buttonClassName, children }: {
  label: string
  menuLabel: string
  button: ReactNode
  buttonClassName: string
  /** The list, drawn only while open. */
  children: (close: () => void) => ReactNode
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
      <button ref={opener} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={buttonClassName}>
        {button}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" aria-label={menuLabel} className="absolute left-0 top-full z-40 mt-1 max-h-[70vh] w-60 overflow-y-auto rounded-xl border border-border bg-surface-1 py-1 shadow-lg">
            {children(close)}
          </div>
        </>
      )}
    </span>
  )
}

export function MenuItems({ items, onChoose }: { items: MenuItem[]; onChoose: () => void }) {
  return (
    <>
      {items.map((item) => (
        <div key={`${item.heading ?? ''}${item.href}`}>
          {item.heading && <div className="px-3 pt-2 pb-0.5 text-micro font-medium uppercase tracking-wide text-text-muted">{item.heading}</div>}
          <Link
            to={item.href}
            role="menuitem"
            aria-current={item.current ? 'page' : undefined}
            onClick={onChoose}
            className="flex items-center gap-2 px-3 py-1.5 text-body text-text-primary hover:bg-surface-hover"
          >
            <span className="w-3.5 shrink-0 text-accent">{item.current && <Check size={14} aria-hidden />}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {item.count && <span className={`shrink-0 text-small ${toneOf(item.tone)}`}>{item.count}</span>}
          </Link>
        </div>
      ))}
    </>
  )
}

export function sectionItems(nav: PlaceNav): MenuItem[] {
  return nav.sections.map((s) => ({ label: s.label, href: s.href, count: s.count, tone: s.tone, current: s.id === nav.current }))
}

const PLACES: MenuItem[] = [
  { label: 'All projects', href: '/projects' },
  { label: 'Your space', href: '/space' },
  { label: 'Agents', href: '/agents' },
]

interface ProjectRow { id: string; key: string; name: string; isMember: boolean; personalOwnerId: string | null }
interface PinRow { kind: string; itemId: string }

/** Your space, then your pinned projects, then the rest A–Z; switching keeps the section shown. */
function ProjectItems({ nav, onChoose }: { nav: PlaceNav; onChoose: () => void }) {
  const { data: projectData } = useQuery(getProjects)
  const { data: pinData } = useQuery(getPins)
  const keep = nav.current === 'overview' ? '' : `?tool=${encodeURIComponent(nav.current)}`
  const projects: ProjectRow[] = (projectData ?? []).filter((p) => p.isMember && !p.personalOwnerId)
  const byId = new Map(projects.map((p) => [p.id, p]))
  const pinned = ((pinData ?? []) as PinRow[])
    .filter((p) => p.kind === 'PROJECT')
    .map((p) => byId.get(p.itemId))
    .filter((p): p is ProjectRow => !!p)
  const rest = projects.filter((p) => !pinned.includes(p)).sort((a, b) => a.name.localeCompare(b.name))
  const row = (p: ProjectRow, heading?: string): MenuItem => ({
    label: p.name, href: `/projects/${p.key}${keep}`, current: nav.kind === 'project' && nav.id === p.id, heading,
  })
  const items: MenuItem[] = [
    { label: 'Your space', href: `/space${keep}`, current: nav.kind === 'space' },
    ...pinned.map((p, i) => row(p, i === 0 ? 'Pinned' : undefined)),
    ...rest.map((p, i) => row(p, i === 0 ? 'All projects' : undefined)),
  ]
  return <MenuItems items={items} onChoose={onChoose} />
}

const CRUMB_BUTTON = 'flex min-w-0 items-center gap-0.5 rounded px-1 -mx-1 hover:bg-surface-hover'

/** A breadcrumb's part that opens a list (the drilled-in navigation): ▾ after its name. */
export function CrumbListMenu({ crumb, list, placeNav, current }: { crumb: Breadcrumb; list: CrumbList; placeNav: PlaceNav | null; current: boolean }) {
  const button = (
    <>
      <span className={`truncate ${current ? 'text-text-primary font-medium' : 'text-accent'}`}>{crumb.label}</span>
      <ChevronDown size={12} className="shrink-0 text-text-muted" aria-hidden />
    </>
  )
  return (
    <CrumbMenu label={crumb.label} menuLabel={crumb.label} button={button} buttonClassName={CRUMB_BUTTON}>
      {(close) => {
        if (list === 'main') {
          const items = [...MAIN_LINKS, ...FOOT_LINKS].map((l) => ({ label: l.label, href: l.to }))
          return <MenuItems items={items} onChoose={close} />
        }
        if (list === 'places') return <MenuItems items={PLACES} onChoose={close} />
        if (!placeNav) return null
        if (list === 'projects') return <ProjectItems nav={placeNav} onChoose={close} />
        return <MenuItems items={sectionItems(placeNav)} onChoose={close} />
      }}
    </CrumbMenu>
  )
}
