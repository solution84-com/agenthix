import { useState, type ReactNode } from 'react'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { ThinkingPill, ThinkingSteps, type ThinkingView } from './ThinkingPill'

/**
 * A turn of the agent's: one small line, its avatar, "Name · 10:26" and the one quiet toggle after the time; its steps
 * under that line while the toggle is open (folded to begin with); then what the turn holds, the full width under it,
 * not indented beside the avatar (owner, 6 Nov: an answer is long, and a column for the face wastes its lines). `open` and `onToggle`
 * hold the toggle from outside, so the ⋯ under an answer can open its steps too.
 */
export function AgentFrame({ agent, meta, thinking, placePath, open: held, onToggle, children }: {
  agent: ConversationAgentView | null
  meta?: ReactNode
  thinking?: ThinkingView | null
  /** The place's address, where a knowledge step's *See change* opens the page's history. */
  placePath?: string
  open?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const name = agent?.name ?? 'Agent'
  const [own, setOwn] = useState(false)
  const open = held ?? own
  const toggle = onToggle ?? (() => setOwn((o) => !o))
  return (
    <div className="space-y-1.5" data-testid="agent-block">
      <div className="flex flex-wrap items-center gap-1.5 text-small">
        <AuthedAgentAvatar name={name} avatarUrl={agent?.avatarUrl} size="sm" />
        <span className="font-medium text-text-primary">{name}</span>
        {meta !== undefined && <>
          <span aria-hidden className="text-text-muted">·</span>
          <span className="text-text-muted">{meta}</span>
        </>}
        {thinking && <ThinkingPill view={thinking} open={open} onToggle={toggle} />}
      </div>
      {thinking && open && <ThinkingSteps steps={thinking.steps} placePath={placePath} />}
      <div className="min-w-0">{children}</div>
    </div>
  )
}
