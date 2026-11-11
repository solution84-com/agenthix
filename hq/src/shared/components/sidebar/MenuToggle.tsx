import { BUTTON_GHOST } from '@agenthix/ui/primitives'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { PlaceNav } from '../../layouts/placeNavTypes'

const ICON_BUTTON = `flex items-center justify-center p-1.5 rounded-lg ${BUTTON_GHOST}`

/** The button that hides a place's menu, or (in the breadcrumb, while it is hidden) shows it again. */
export function MenuToggle({ nav, hidden, onToggle }: { nav: PlaceNav; hidden: boolean; onToggle: () => void }) {
  const Icon = hidden ? PanelLeftOpen : PanelLeftClose
  const label = `${hidden ? 'Show' : 'Hide'} ${nav.name}'s menu`
  return (
    <button type="button" onClick={onToggle} aria-label={label} title={label} className={`${ICON_BUTTON} shrink-0`}>
      <Icon size={16} />
    </button>
  )
}
