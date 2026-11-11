import { useState } from 'react'
import { Bot, Check, X } from 'lucide-react'
import { CARD_CLICKABLE, MENU_ITEM, MENU_ITEM_CHOSEN } from '@agenthix/ui/primitives'

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
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border text-left ${CARD_CLICKABLE}`}
      >
        {agent ? (
          <>
            <div className="w-8 h-8 rounded-lg bg-chip flex items-center justify-center text-body font-medium text-text-primary shrink-0">
              {(agent.handle as string)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-medium text-text-primary truncate">{agent.name}</p>
              <p className="text-micro text-text-muted">@{agent.handle}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-chip flex items-center justify-center shrink-0">
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
        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-xl shadow-pop overflow-hidden">
          {agents.map((a: any) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onAssign(a.id); setOpen(false) }}
              className={`items-center! gap-3 ${a.id === currentAgentId ? MENU_ITEM_CHOSEN : MENU_ITEM}`}
            >
              <div className="w-7 h-7 rounded-lg bg-chip flex items-center justify-center text-small font-medium text-text-primary shrink-0">
                {(a.handle as string)[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-small font-medium text-text-primary truncate">{a.name}</p>
                <p className="text-micro text-text-muted">@{a.handle}</p>
              </div>
              {a.id === currentAgentId && <Check size={10} className="shrink-0" />}
            </button>
          ))}
          {agent && (
            <button
              type="button"
              onClick={() => { onAssign(null); setOpen(false) }}
              className={`items-center! gap-3 rounded-none border-t border-border-subtle ${MENU_ITEM}`}
            >
              <div className="w-7 h-7 rounded-lg bg-chip flex items-center justify-center shrink-0">
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
