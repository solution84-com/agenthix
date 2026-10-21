import { useState, type ReactNode } from 'react'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { ThinkingPill, ThinkingSteps, type ThinkingView } from './ThinkingPill'

/**
 * A turn of the agent's: its avatar, "Name · 10:26" with the thinking pill after the time, its steps under the
 * name line while the pill is open — closed to begin with — then what the turn holds.
 */
export function AgentFrame({ agent, meta, thinking, children }: {
  agent: ConversationAgentView | null
  meta?: ReactNode
  thinking?: ThinkingView | null
  children?: ReactNode
}) {
  const name = agent?.name ?? 'Agent'
  const [open, setOpen] = useState(false)
  return (
    <div className="flex gap-3" data-testid="agent-block">
      <AuthedAgentAvatar name={name} avatarUrl={agent?.avatarUrl} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-1.5 text-small">
          <span className="font-semibold text-text-primary">{name}</span>
          {meta !== undefined && <>
            <span aria-hidden className="text-text-muted">·</span>
            <span className="text-text-muted">{meta}</span>
          </>}
          {thinking && <ThinkingPill view={thinking} open={open} onToggle={() => setOpen((o) => !o)} />}
        </div>
        {thinking && open && <ThinkingSteps steps={thinking.steps} />}
        {children}
      </div>
    </div>
  )
}
