import { ChevronDown } from 'lucide-react'
import { FindProjectButton } from '../components/sidebar/FindProject'
import type { Breadcrumb } from './ScreenBar'
import type { PlaceNav } from './placeNavTypes'

/** The project's part of the breadcrumb: its name ▾, plain text, opening Find a project. */
export function CrumbListMenu({ crumb, placeNav, current }: { crumb: Breadcrumb; placeNav: PlaceNav; current: boolean }) {
  return (
    <FindProjectButton
      nav={placeNav}
      label={`${crumb.label}, find a project`}
      className="flex min-w-0 items-center gap-0.5 text-accent hover:text-accent-hover"
    >
      <span className={`truncate ${current ? 'text-text-primary font-medium' : ''}`}>{crumb.label}</span>
      <ChevronDown size={12} className="shrink-0 text-text-muted" aria-hidden />
    </FindProjectButton>
  )
}
