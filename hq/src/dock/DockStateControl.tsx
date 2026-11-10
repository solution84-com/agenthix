import { Maximize2, PanelRight, PanelRightClose } from 'lucide-react'
import type { DockPosition } from './DockContext'
import { SELECTED } from './dockStyles'

/** The panel's three states, in the order the control shows them, each with its own icon. */
export const PANEL_STATES: { position: DockPosition; label: string; Icon: typeof PanelRight }[] = [
  { position: 'collapsed', label: 'Minimised (⌘J)', Icon: PanelRightClose },
  { position: 'docked', label: 'Beside the page', Icon: PanelRight },
  { position: 'expanded', label: 'Over the page', Icon: Maximize2 },
]

export const OVER_REFUSED = 'Close the file to put the chat over the page.'

/**
 * The top of the chat's bar: one control for the panel's state, the current one in the selected fill. One click goes to any of
 * them; choosing beside or over the page opens it on the conversation that was open, where the person left it.
 */
export function DockStateControl({ position, onChoose, besideFile = false }: {
  position: DockPosition
  onChoose: (position: DockPosition) => void
  /** A file is open in the viewer: the chat stays beside it, so Over the page is greyed, with why. */
  besideFile?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Chat panel" data-testid="dock-state" className="flex flex-col items-center gap-2">
      {PANEL_STATES.map(({ position: p, label, Icon }) => {
        const on = p === position
        const refused = besideFile && p === 'expanded' && !on
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={refused ? OVER_REFUSED : label}
            aria-disabled={refused || undefined}
            data-position={p}
            onClick={() => { if (!on && !refused) onChoose(p) }}
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${on ? SELECTED : refused ? 'cursor-not-allowed text-text-secondary opacity-40' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
          >
            <Icon size={18} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
