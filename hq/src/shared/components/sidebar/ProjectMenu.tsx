import { Link } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { PinButton } from '../../../pins/components/PinButton'
import type { PlaceNav } from '../../layouts/placeNavTypes'
import { FindProjectButton } from './FindProject'
import { switchesProject } from './projectChoices'
import { MenuToggle } from './MenuToggle'
import { PlaceNavAvatar, PlaceSections } from './PlacePanel'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/** The menu's header: the place's name ▾ (Find a project), its pin, and the hide icon. */
function ProjectMenuHeader({ nav, onHide }: { nav: PlaceNav; onHide: () => void }) {
  const pinKind = nav.kind === 'project' ? 'PROJECT' : nav.kind === 'agent' ? 'AGENT' : null
  const name = (
    <>
      <PlaceNavAvatar nav={nav} size="sm" />
      <span className="min-w-0 truncate text-body font-medium text-text-primary">{nav.name}</span>
    </>
  )
  const nameClass = `flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING}`
  return (
    <div data-testid="place-menu-header" className="shrink-0 flex items-center gap-1 pb-2 mb-1 border-b border-border-subtle">
      <div className="min-w-0 flex-1">
        {switchesProject(nav) ? (
          <FindProjectButton nav={nav} label={`${nav.name}, find a project`} className={`${nameClass} max-w-full`}>
            {name}
            <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
          </FindProjectButton>
        ) : (
          <Link to={nav.homePath} className={nameClass}>{name}</Link>
        )}
      </div>
      {pinKind && nav.id && <PinButton kind={pinKind} itemId={nav.id} />}
      <MenuToggle nav={nav} hidden={false} onToggle={onHide} />
    </div>
  )
}

/** At icon width (a medium window): the place's avatar, opening its Overview, over the hide icon. */
function IconMenuHeader({ nav, onHide }: { nav: PlaceNav; onHide: () => void }) {
  return (
    <div data-testid="place-menu-header" className="shrink-0 flex flex-col items-center gap-1.5 pb-2 mb-1 border-b border-border-subtle">
      <Link to={nav.homePath} aria-label={nav.name} title={nav.name} className={`rounded-lg p-1 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING}`}>
        <PlaceNavAvatar nav={nav} size="sm" />
      </Link>
      <MenuToggle nav={nav} hidden={false} onToggle={onHide} />
    </div>
  )
}

/**
 * A place's own menu, beside the rail and never instead of it: its header, then every section under its group's
 * label. On a medium window it is one icon per section.
 */
export function ProjectMenu({ nav, icons, onHide }: { nav: PlaceNav; icons: boolean; onHide: () => void }) {
  return (
    <nav
      aria-label={`${nav.name} menu`}
      data-testid="place-menu"
      className={`hidden lg:flex h-full shrink-0 flex-col pt-3 bg-surface-0 border-r border-border-subtle ${icons ? 'w-[64px] px-2' : 'w-56 px-3'}`}
    >
      {icons ? <IconMenuHeader nav={nav} onHide={onHide} /> : <ProjectMenuHeader nav={nav} onHide={onHide} />}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2">
        <PlaceSections nav={nav} collapsed={icons} />
      </div>
    </nav>
  )
}
