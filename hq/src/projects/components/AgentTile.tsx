import { useState } from 'react'
import { Bot, Check, X } from 'lucide-react'

export function AgentTile({
  currentAgentId,
  agents,
  onAssign,
}: {
  currentAgentId: string | null
  agents: any[]
  onAssign: (agentId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const agent = agents.find(a => a.id === currentAgentId) ?? null

  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}

      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-surface-1 border border-border-subtle hover:border-accent transition-colors text-left"
      >
        {agent ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-body font-medium text-accent-hover shrink-0">
              {(agent.handle as string)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-text-primary truncate">{agent.name}</p>
              <p className="text-micro text-text-muted">@{agent.handle}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-text-muted/70" />
            </div>
            <div className="flex-1">
              <p className="text-body text-text-muted italic">No agent assigned</p>
              <p className="text-micro text-text-muted/70">Tap to assign</p>
            </div>
          </>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-surface-1 border border-border rounded-xl shadow-2xl overflow-hidden">
          {agents.map((a: any) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onAssign(a.id); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
            >
              <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center text-small font-medium text-accent-hover shrink-0">
                {(a.handle as string)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-small font-semibold text-text-secondary truncate">{a.name}</p>
                <p className="text-micro text-text-muted">@{a.handle}</p>
              </div>
              {a.id === currentAgentId && <Check size={10} className="text-accent shrink-0" />}
            </button>
          ))}
          {agent && (
            <button
              type="button"
              onClick={() => { onAssign(null); setOpen(false) }}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left border-t border-border-subtle"
            >
              <div className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
                <X size={10} className="text-text-muted" />
              </div>
              <p className="text-small text-text-muted">Unassign</p>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
