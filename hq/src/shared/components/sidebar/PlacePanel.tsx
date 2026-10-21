import { Fragment, forwardRef } from 'react'
import { Link } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { ChevronLeft } from 'lucide-react'
import { PlaceAvatar } from '@agenthix/ui/primitives'
import { PinButton } from '../../../pins/components/PinButton'
import { AuthedAgentAvatar } from '../AuthedAgentAvatar'
import type { PlaceNav, PlaceNavSection } from '../../layouts/placeNavTypes'
import { badgeOf, sectionIcon } from './sectionIcons'

const ICON_BUTTON = 'flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors'

function countTone(tone: PlaceNavSection['tone']): string {
  return tone === 'needs' ? 'text-warning' : tone === 'live' ? 'text-success' : 'text-text-muted'
}

function PlaceNavAvatar({ nav, size }: { nav: PlaceNav; size: 'sm' | 'md' }) {
  const { data: user } = useAuth()
  if (nav.kind === 'agent') return <AuthedAgentAvatar name={nav.name} avatarUrl={nav.avatarUrl} size="sm" />
  return <PlaceAvatar kind="project" id={nav.id ?? user?.id ?? nav.name} name={nav.name} size={size} />
}

/** ‹: shows the main navigation over the panel. It goes nowhere itself. */
export const BackButton = forwardRef<HTMLButtonElement, { onClick: () => void; expanded: boolean; className?: string }>(
  function BackButton({ onClick, expanded, className = '' }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label="Show the main navigation"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        title="Go to…"
        className={`${ICON_BUTTON} ${className}`}
      >
        <ChevronLeft size={18} />
      </button>
    )
  },
)

/** The place's header at the top of the drilled-in panel: ‹, its avatar, its name (Overview), its pin. */
export function PlacePanelHeader({ nav, back }: { nav: PlaceNav; back: React.ReactNode }) {
  const pinKind = nav.kind === 'project' ? 'PROJECT' : nav.kind === 'agent' ? 'AGENT' : null
  return (
    <div data-testid="place-panel-header" className="shrink-0 flex items-center gap-1.5 px-2 pb-2 mb-1 border-b border-border-subtle">
      {back}
      <Link to={nav.homePath} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-hover">
        <PlaceNavAvatar nav={nav} size="sm" />
        <span className="truncate text-body font-semibold text-text-primary">{nav.name}</span>
      </Link>
      {pinKind && nav.id && <PinButton kind={pinKind} itemId={nav.id} />}
    </div>
  )
}

function SectionLink({ nav, section, collapsed, onNavigate }: {
  nav: PlaceNav
  section: PlaceNavSection
  collapsed: boolean
  onNavigate?: () => void
}) {
  const on = section.id === nav.current
  const Icon = sectionIcon(nav.kind, section.id)
  const badge = badgeOf(section.count)
  const title = section.count ? `${section.label} · ${section.count}` : section.label
  return (
    <Link
      to={section.href}
      onClick={onNavigate}
      aria-current={on ? 'page' : undefined}
      aria-label={collapsed ? title : undefined}
      title={collapsed ? title : undefined}
      className={`relative flex items-center gap-3 rounded-lg transition-colors ${collapsed ? 'justify-center w-10 h-9 mx-auto' : 'px-2 py-1.5'} ${
        on ? 'bg-accent-subtle text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
      }`}
    >
      <Icon size={16} className={`shrink-0 ${on ? 'text-accent' : ''}`} />
      {!collapsed && <span className="flex-1 truncate text-body">{section.label}</span>}
      {!collapsed && section.count && <span className={`shrink-0 text-small ${countTone(section.tone)}`}>{section.count}</span>}
      {collapsed && badge && (
        <span
          data-testid="section-badge"
          className={`absolute top-0 right-0 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full text-surface-0 text-micro font-semibold leading-none ${section.tone === 'needs' ? 'bg-warning' : section.tone === 'live' ? 'bg-success' : 'bg-text-muted'}`}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}

/**
 * The drilled-in panel's list: every section of the place with its count, the one shown marked, under small
 * group labels with nothing nested. Collapsed, each is its icon, its name on hover and its count as a badge.
 */
export function PlaceSections({ nav, collapsed, onNavigate }: { nav: PlaceNav; collapsed: boolean; onNavigate?: () => void }) {
  return (
    <div role="list" aria-label={`${nav.name} sections`} className="space-y-0.5">
      {nav.sections.map((s, i) => {
        const startsGroup = i > 0 && s.group !== nav.sections[i - 1].group
        return (
          <Fragment key={s.id}>
            {startsGroup && (collapsed || !s.group
              ? <div aria-hidden className="mx-2 my-1.5 border-t border-border-subtle" />
              : <div className="px-2 pt-3 pb-0.5 text-micro font-medium uppercase tracking-wide text-text-muted">{s.group}</div>)}
            <div role="listitem"><SectionLink nav={nav} section={s} collapsed={collapsed} onNavigate={onNavigate} /></div>
          </Fragment>
        )
      })}
    </div>
  )
}

/** Collapsed: ‹ on top, then the place's avatar, which opens its Overview. */
export function CollapsedPlaceHead({ nav, back }: { nav: PlaceNav; back: React.ReactNode }) {
  return (
    <div data-testid="place-panel-header" className="shrink-0 flex flex-col items-center gap-1.5 pb-2 mb-1 border-b border-border-subtle">
      {back}
      <Link to={nav.homePath} aria-label={nav.name} title={nav.name} className="rounded-lg p-1 hover:bg-surface-hover">
        <PlaceNavAvatar nav={nav} size="sm" />
      </Link>
    </div>
  )
}
