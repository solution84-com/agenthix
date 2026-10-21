import { ChevronRight, Maximize2, Minimize2, Plus } from 'lucide-react'
import { useLocation } from 'react-router'
import type { DockValue } from './DockContext'
import { DockHistory } from './DockHistory'
import { canvasPlaceOf } from './startPlace'
import { DOCK_BUTTON } from './dockStyles'

/**
 * The dock's buttons (spec §2): recent 🕘, new ＋, expand ⤢ (or back to docked), collapse ›. Full screen on a narrow
 * window there is nothing to expand, and the header's ‹ puts the conversation away to its pill.
 */
export function DockActions({ dock }: { dock: DockValue }) {
  const { pathname } = useLocation()
  const expanded = dock.position === 'expanded'
  const narrow = dock.width === 'narrow'
  return (
    <>
      <DockHistory />
      <button
        type="button"
        aria-label="New conversation"
        title="New conversation"
        onClick={() => dock.startNew(canvasPlaceOf(pathname))}
        className={DOCK_BUTTON}
      >
        <Plus size={16} aria-hidden />
      </button>
      {!narrow && (
        <>
          <button
            type="button"
            aria-label={expanded ? 'Dock beside the page' : 'Expand over the page'}
            title={expanded ? 'Dock beside the page' : 'Expand over the page'}
            onClick={() => dock.setPosition(expanded ? 'docked' : 'expanded')}
            className={DOCK_BUTTON}
          >
            {expanded ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          </button>
          <button
            type="button"
            aria-label="Collapse (⌘J)"
            title="Collapse (⌘J)"
            onClick={() => dock.setPosition('collapsed')}
            className={DOCK_BUTTON}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </>
      )}
    </>
  )
}
