import type { ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'
import type { InboxConversation } from '../shared/conversations/inbox'
import { rowTime } from '../places/conversationGroups'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'

/**
 * A conversation's face: its agent, with its state on it — ! when it needs the person, the number of unread replies,
 * a small dot while the agent is working.
 */
export function InboxFace({ conversation: c }: { conversation: InboxConversation }) {
  return (
    <span className="relative inline-flex shrink-0 rounded-full p-0.5" data-working={c.working || undefined}>
      {c.agent
        ? <AuthedAgentAvatar name={c.agent.name} avatarUrl={c.agent.avatarUrl} size="sm" />
        : <MessageSquare size={18} aria-hidden className="m-1 text-text-secondary" />}
      {c.working && <WorkingDot />}
      {c.needsYou > 0
        ? <StateBadge tone="needs">!</StateBadge>
        : c.unread > 0 ? <StateBadge tone="unread">{c.unread > 99 ? '99+' : c.unread}</StateBadge> : null}
    </span>
  )
}

/** An agent is working here: a small dot on the face's lower corner. */
export function WorkingDot() {
  return <span aria-hidden data-testid="working-dot" className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface-0" />
}

export function StateBadge({ tone, children }: { tone: 'needs' | 'unread'; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-semibold leading-none text-on-accent ring-2 ring-surface-0 ${tone === 'needs' ? 'bg-warning' : 'bg-accent'}`}
    >
      {children}
    </span>
  )
}

/** What a row's state says to a screen reader, and on a place's list in words. */
export function stateWords(c: InboxConversation, open: boolean): string | null {
  if (c.needsYou > 0) return 'needs your okay'
  if (c.unread > 0) return `${c.unread} new ${c.unread === 1 ? 'reply' : 'replies'}`
  if (c.working) return 'working…'
  return open ? "you're here" : null
}

const placeName = (c: InboxConversation) => (c.place.kind === 'space' ? 'Your space' : c.place.name)

/**
 * A row of the Conversations list (the board's state 4): the face, the title (bold while unread), the time, the last
 * line with who said it, and the place. A row that needs the person is tinted. The button is as wide as the list (`w-full`: a button is only as wide as its text
 * otherwise), so every line ends with … inside it. `showPlace` false leaves the place
 * out, where the list is one place's; there the state is said in words instead of the last line.
 */
export function InboxRow({ conversation: c, open, showPlace = true, lead, onChoose }: {
  conversation: InboxConversation
  open: boolean
  showPlace?: boolean
  /** Drawn before the row, in its line: the Chat page's tick box while several are being chosen. */
  lead?: ReactNode
  onChoose: () => void
}) {
  const title = c.title || 'New conversation'
  const words = stateWords(c, open)
  const line = showPlace
    ? c.lastLine && `${c.lastLine.by === 'you' ? 'You' : c.agent?.name ?? 'Agent'}: ${c.lastLine.text}`
    : [c.agent?.name, words].filter(Boolean).join(' · ')
  return (
    <li className={lead ? 'flex min-w-0 items-center gap-1' : 'min-w-0'}>
      {lead}
      <button
        type="button"
        data-testid="inbox-row"
        data-id={c.id}
        aria-current={open ? 'true' : undefined}
        aria-label={[title, words, showPlace ? placeName(c) : null].filter(Boolean).join(', ')}
        onClick={onChoose}
        className={`flex w-full min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover aria-[current]:bg-accent-subtle ${c.needsYou > 0 ? 'bg-warning/10' : ''}`}
      >
        <InboxFace conversation={c} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-body text-text-primary ${c.unread > 0 ? 'font-semibold' : ''}`}>{title}</span>
            <span className="shrink-0 text-small text-text-muted">{rowTime(c.lastMessageAt)}</span>
          </span>
          {line && <span className={`block truncate text-small ${c.needsYou > 0 && !showPlace ? 'text-warning' : 'text-text-secondary'}`}>{line}</span>}
          {showPlace && <span className="block truncate text-small text-text-muted">{placeName(c)}</span>}
        </span>
      </button>
    </li>
  )
}
