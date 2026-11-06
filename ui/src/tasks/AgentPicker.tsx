import { useState } from 'react'
import { X, Check, ChevronDown } from 'lucide-react'
import { AgentAvatar } from '../sessions/SessionComponents'
import { CONTROL_HEIGHT } from '../primitives/controlStyles'

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
        className={`${CONTROL_HEIGHT} w-full flex items-center gap-2 bg-surface-1 border border-border rounded-lg pl-1.5 pr-2.5 text-small text-text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60`}
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
        <div className="absolute top-full left-0 mt-1 z-20 w-48 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
          {agents.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onAssign(a.id); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-hover transition-colors text-left"
            >
              <AgentAvatar name={a.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-small font-semibold text-text-secondary truncate">{a.name}</p>
              </div>
              {a.id === currentAgentId && <Check size={10} className="text-accent shrink-0" />}
            </button>
          ))}
          {agent && (
            <button
              type="button"
              onClick={() => { onAssign(null); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-hover transition-colors text-left border-t border-border-subtle"
            >
              <div className="w-6 h-6 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                <X size={9} className="text-text-muted" />
              </div>
              <p className="text-small text-text-muted">Unassign</p>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
