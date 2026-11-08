import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { RunAvatar } from '@agenthix/ui/tasks'

/**
 * One thing that waits for the person, as a bar at the foot of a Workroom or Runs card (spec, "Needs you sits as bars
 * at the foot of each Workroom card"): the alert, the agent's avatar with its Needs-you ring, the task's key and title
 * or the routine's name, what it waits for, and the one answer (an outlined `Button`: Answer, Review, Open). The card
 * itself has no heavy outline; the bars say it.
 */
export function NeedsYouBar({ agentName, avatar, why, taskKey, title, detail, action }: {
  agentName: string
  /** The agent's avatar (`AuthedAgentAvatar` size sm); the bar draws its ring. */
  avatar: ReactNode
  /** Why it waits, in the avatar's words: "asked you something", "needs your okay", "failed". */
  why: string
  taskKey?: string | null
  title: string
  /** After the title: "· needs Kai's okay: asks to commit 4 fixes". */
  detail?: string | null
  action?: ReactNode
}) {
  return (
    <div data-testid="needs-you-bar" className="flex min-h-12 items-center gap-2 rounded-lg bg-surface-2 py-1 pl-3 pr-1.5">
      <TriangleAlert size={16} aria-hidden className="shrink-0 text-warning" />
      <RunAvatar name={agentName} state="NEEDS_YOU" detail={why}>{avatar}</RunAvatar>
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
        {taskKey && <span className="shrink-0 font-mono text-micro text-text-muted">{taskKey}</span>}
        <b className="shrink-0 font-medium">{title}</b>
        {detail && <span className="truncate text-small text-text-secondary" title={detail}>{detail}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** The bars at a card's foot, 8 px apart, under a thin divider; nothing when nothing waits. */
export function NeedsYouBars({ children, label = 'Needs you' }: { children: ReactNode; label?: string }) {
  const any = Array.isArray(children) ? children.some(Boolean) : !!children
  if (!any) return null
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2 border-t border-border-subtle px-4 py-3 max-sm:px-3">
      {children}
    </div>
  )
}
