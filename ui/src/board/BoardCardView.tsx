import type { ReactNode } from 'react'
import { AgentAvatar } from '../sessions/SessionComponents'
import { OverflowMenu, type OverflowItem } from '../tasks/OverflowMenu'
import { PriorityDot } from '../tasks/TasksToolParts'
import { runWaitText } from '../tasks/runState'
import { cardStateText } from './cardState'
import type { BoardCardData } from './types'

const TONE: Record<string, string> = { needs: 'text-warning', live: 'text-success', muted: 'text-text-muted' }

/** The mark of a task's conversation: a speech bubble, with the count of what the viewer has not read. */
function ThreadMark({ unread }: { unread: number }) {
  const label = unread > 0 ? `Conversation, ${unread} unread` : 'Conversation'
  return (
    <span role="img" aria-label={label} data-testid="thread-mark" className={`inline-flex items-center gap-0.5 ${unread > 0 ? 'text-accent' : 'text-text-muted'}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unread > 0 && <span className="text-micro font-medium">{unread > 99 ? '99+' : unread}</span>}
    </span>
  )
}

function isFuture(v: string | Date | null | undefined): v is string | Date {
  return !!v && new Date(v).getTime() > Date.now()
}

/**
 * A task on a board: its priority as a dot, key and title, its agent, where it stands, and a ⋯ for what a
 * person can do with it. A `row` is a line of a stacked list; a `card` stands in a column.
 */
export function BoardCardView({ card, variant, now, onOpen, menu, from, linkRoutine, linkAgent }: {
  card: BoardCardData
  variant: 'row' | 'card'
  now: Date
  onOpen: () => void
  menu: OverflowItem[]
  /** The board a Show also task belongs to, named on it. */
  from?: string
  linkRoutine?: (routineId: string, children: ReactNode) => ReactNode
  linkAgent?: (agentId: string, children: ReactNode) => ReactNode
}) {
  const state = cardStateText(card, now)
  const wait = runWaitText(card.runWait)
  const arrives = isFuture(card.roundAt) ? `Arrives ${new Date(card.roundAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : null
  const shell = variant === 'card'
    ? 'rounded-xl border border-border-subtle bg-surface-1 px-3 py-2.5 hover:border-accent'
    : 'px-4 py-2.5 ring-inset hover:ring-1 hover:ring-accent'
  return (
    <div className={`flex items-start gap-2 ${shell}`}>
      <div className="min-w-0 flex-1 space-y-0.5">
        <button
          type="button" onClick={onOpen} aria-label={`Open ${card.taskKey}`}
          className="block w-full cursor-pointer space-y-0.5 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span className="block text-body leading-snug text-text-primary">
            <PriorityDot priority={card.priority} className="mr-2 align-middle" />
            <span className="mr-1.5 font-mono text-micro text-text-muted">{card.taskKey}</span>
            {card.isEpic && <span className="mr-1.5 rounded-md bg-accent-subtle px-1.5 text-micro font-medium text-accent">Epic</span>}
            {card.title}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 pl-4 text-small">
            {card.assignedAgent && (linkAgent
              ? linkAgent(card.assignedAgent.id, <AgentAvatar name={card.assignedAgent.name} size="sm" />)
              : <AgentAvatar name={card.assignedAgent.name} size="sm" />)}
            <span className={TONE[state.tone]}>{state.text}</span>
            {typeof card.threadUnread === 'number' && <ThreadMark unread={card.threadUnread} />}
            {wait && <span className="text-micro text-text-muted">{wait}</span>}
          </span>
        </button>
        {(from || arrives || card.routineId) && (
          <span className="flex items-center gap-1.5 pl-4 text-micro text-text-muted">
            {card.routineId && <span title="A round of a routine" className="text-accent">{linkRoutine ? linkRoutine(card.routineId, '↻') : '↻'}</span>}
            {from && <span>In {from}</span>}
            {arrives && <span>{arrives}</span>}
          </span>
        )}
      </div>
      <div onPointerDown={e => e.stopPropagation()}><OverflowMenu items={menu} label={`Actions for ${card.taskKey}`} /></div>
    </div>
  )
}
