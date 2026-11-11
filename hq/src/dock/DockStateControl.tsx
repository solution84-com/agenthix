import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { DOCK_BUTTON, SELECTED } from './dockStyles'

/**
 * The top of the chat's bar: one button that minimises the panel and opens it again, as ⌘J does, in the selected fill
 * while the panel is open. Its label says which it will do. Over the page or beside it is the conversation's ⋯ menu.
 */
export function DockStateControl({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const label = open ? 'Minimise the chat (⌘J)' : 'Open the chat (⌘J)'
  const Icon = open ? PanelRightClose : PanelRightOpen
  return (
    <button
      type="button"
      data-testid="dock-state"
      aria-label={label}
      title={label}
      aria-expanded={open}
      onClick={onToggle}
      className={`${DOCK_BUTTON} ${open ? SELECTED : ''}`}
    >
      <Icon size={18} aria-hidden />
    </button>
  )
}
