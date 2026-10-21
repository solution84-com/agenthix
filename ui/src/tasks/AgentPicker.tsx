import { useState } from 'react'
import { X, Check, ChevronDown } from 'lucide-react'

export interface AgentPickerOption {
  id: string
  name: string
  handle: string
}

export interface AgentPickerProps {
  currentAgentId: string | null
  agents: AgentPickerOption[]
  onAssign: (id: string | null) => void
}

export function AgentPicker({ currentAgentId, agents, onAssign }: AgentPickerProps) {
  const [open, setOpen] = useState(false)
  const agent = agents.find(a => a.id === currentAgentId) ?? null

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-small text-text-secondary hover:border-border transition-colors"
      >
        {agent ? (
          <>
            <div className="w-4 h-4 rounded bg-accent/20 flex items-center justify-center text-micro font-medium text-accent shrink-0">
              {agent.handle[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="flex-1 text-left truncate">{agent.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-text-muted italic">No agent</span>
        )}
        <ChevronDown size={11} className="text-text-muted shrink-0" />
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
              <div className="w-6 h-6 rounded-lg bg-accent/15 flex items-center justify-center text-micro font-medium text-accent shrink-0">
                {a.handle[0]?.toUpperCase() ?? '?'}
              </div>
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
