import { Maximize2, PanelRight, PanelRightClose } from 'lucide-react'
import type { DockPosition } from './DockContext'
import { SELECTED } from './dockStyles'

/** The panel's three states, in the order the control shows them, each with its own icon. */
export const PANEL_STATES: { position: DockPosition; label: string; Icon: typeof PanelRight }[] = [
  { position: 'collapsed', label: 'Minimised (⌘J)', Icon: PanelRightClose },
  { position: 'docked', label: 'Beside the page', Icon: PanelRight },
  { position: 'expanded', label: 'Over the page', Icon: Maximize2 },
]

/**
 * The top of the chat's bar: one control for the panel's state, the current one in the selected fill. One click goes to any of
 * them; choosing beside or over the page opens it on the conversation that was open, where the person left it.
 */
export function DockStateControl({ position, onChoose }: { position: DockPosition; onChoose: (position: DockPosition) => void }) {
  return (
    <div role="radiogroup" aria-label="Chat panel" data-testid="dock-state" className="flex flex-col items-center gap-2">
      {PANEL_STATES.map(({ position: p, label, Icon }) => {
        const on = p === position
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            data-position={p}
            onClick={() => { if (!on) onChoose(p) }}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${on ? SELECTED : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
          >
            <Icon size={18} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
