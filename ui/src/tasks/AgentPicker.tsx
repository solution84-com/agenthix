import { useState } from 'react'
import { X, Check, ChevronDown } from 'lucide-react'
import { AgentAvatar } from '../sessions/SessionComponents'
import { CONTROL_HEIGHT, FIELD } from '../primitives/controlStyles'
import { MENU_ITEM, MENU_ITEM_CHOSEN } from '../primitives/Menus'

export interface AgentPickerOption {
  id: string
  name: string
  handle?: string
}

export interface AgentPickerProps {
  currentAgentId: string | null
  agents: AgentPickerOption[]
  onAssign: (id: string | null) => void
  /** Greyed, with `disabledReason` as its tooltip: a refusal known in advance (a project Viewer). */
  disabled?: boolean
  disabledReason?: string
}

/** A task's agent, drawn as every field is (white, bordered, 36 px; 44 px on a phone), the agent's own avatar in it. */
export function AgentPicker({ currentAgentId, agents, onAssign, disabled = false, disabledReason }: AgentPickerProps) {
  const [open, setOpen] = useState(false)
  const agent = agents.find(a => a.id === currentAgentId) ?? null

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      <button
        type="button"
        aria-label={`Agent: ${agent?.name ?? 'No agent'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => setOpen(v => !v)}
        className={`${CONTROL_HEIGHT} w-full flex items-center gap-2 rounded-lg pl-1.5 pr-2.5 text-small ${FIELD}`}
      >
        {agent ? (
          <>
            <AgentAvatar name={agent.name} size="sm" />
            <span className="flex-1 text-left truncate">{agent.name}</span>
          </>
        ) : (
          <span className="flex-1 pl-1 text-left text-text-muted">No agent</span>
        )}
        <ChevronDown size={14} aria-hidden className="text-text-muted shrink-0" />
      </button>

      {open && (
        <div role="menu" aria-label="Agent" className="absolute top-full left-0 mt-1 z-20 w-full min-w-48 max-h-72 overflow-y-auto bg-popover border border-border rounded-xl p-1.5 shadow-pop">
          {agents.map(a => (
            <button
              key={a.id}
              type="button"
              role="menuitemradio"
              aria-checked={a.id === currentAgentId}
              onClick={() => { onAssign(a.id); setOpen(false) }}
              className={`${a.id === currentAgentId ? MENU_ITEM_CHOSEN : MENU_ITEM} items-center!`}
            >
              <AgentAvatar name={a.name} size="sm" />
              <span className="flex-1 min-w-0 truncate">{a.name}</span>
              {a.id === currentAgentId && <Check size={14} aria-hidden className="shrink-0" />}
            </button>
          ))}
          {agent && (
            <div className="mt-1 border-t border-border-subtle pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => { onAssign(null); setOpen(false) }}
                className={`${MENU_ITEM} items-center!`}
              >
                <span className="w-6 h-6 rounded-lg bg-chip flex items-center justify-center shrink-0">
                  <X size={12} aria-hidden className="text-text-muted" />
                </span>
                Unassign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
