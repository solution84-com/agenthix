import type { ReactNode } from 'react'
import { Check, MessageSquare } from 'lucide-react'
import type { InboxConversation } from '../shared/conversations/inbox'
import { rowTime } from '../places/conversationGroups'
import { FOCUS_RING, PlaceAvatar, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'

/**
 * A conversation's face: its agent, with the place's tile on the lower corner (named in its tooltip) and a small dot
 * while the agent is working. What needs the person, and what is unread, is the row's own mark at its right.
 */
export function InboxFace({ conversation: c, showPlace = true }: { conversation: InboxConversation; showPlace?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0 rounded-full p-0.5" data-working={c.working || undefined}>
      {c.agent
        ? <AuthedAgentAvatar name={c.agent.name} avatarUrl={c.agent.avatarUrl} size="md" />
        : <MessageSquare size={18} aria-hidden className="m-1 text-text-secondary" />}
      {c.working && <WorkingDot />}
      {showPlace && (
        <span data-testid="place-tile" title={placeName(c)} className="absolute -bottom-1 -right-1 inline-flex rounded-md ring-2 ring-surface-0">
          <PlaceAvatar kind="project" id={c.place.kind === 'space' ? 'space' : c.place.id} name={placeName(c)} size="xs" />
        </span>
      )}
    </span>
  )
}

/** An agent is working here: a small dot on the face's corner. */
export function WorkingDot({ className = '-bottom-0.5 -right-0.5' }: { className?: string } = {}) {
  return <span aria-hidden data-testid="working-dot" className={`absolute ${className} h-2.5 w-2.5 rounded-full bg-text-primary ring-2 ring-surface-0`} />
}

export function StateBadge({ tone, children }: { tone: 'needs' | 'unread'; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={`absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-micro font-medium leading-none ring-2 ring-surface-0 ${tone === 'needs' ? 'bg-warning text-on-accent' : 'bg-text-primary text-surface-1'}`}
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

const countOf = (n: number) => (n > 99 ? '99+' : String(n))

/**
 * A row of the Conversations list: two lines. The title (bold while unread) and the time (in the accent colour while
 * unread); then the last line with who said it, and at the right the count of what is unread, or ! for what needs
 * the person. The place is its tile on the agent's face. The open row has an accent bar at its left. The button is as
 * wide as the list (`w-full`: a button is only as wide as its text otherwise), so every line ends with … inside it.
 * `showPlace` false leaves the tile out, where the list is one place's; there the state is said in words instead of
 * the last line.
 */
export function InboxRow({ conversation: c, open, showPlace = true, selected, onChoose }: {
  conversation: InboxConversation
  open: boolean
  showPlace?: boolean
  /** While several are being chosen (the Chat page): whether this one is, drawn as a tick box inside the row, which
   * the whole row toggles. Undefined otherwise. */
  selected?: boolean
  onChoose: () => void
}) {
  const title = c.title || 'New conversation'
  const words = stateWords(c, open)
  const line = showPlace
    ? c.lastLine && `${c.lastLine.by === 'you' ? 'You' : c.agent?.name ?? 'Agent'}: ${c.lastLine.text}`
    : [c.agent?.name, words].filter(Boolean).join(' · ')
  return (
    <li className="min-w-0">
      <button
        type="button"
        data-testid="inbox-row"
        data-id={c.id}
        role={selected === undefined ? undefined : 'checkbox'}
        aria-checked={selected}
        aria-current={open ? 'true' : undefined}
        aria-label={selected === undefined ? [title, words, showPlace ? placeName(c) : null].filter(Boolean).join(', ') : `Select ${title}`}
        onClick={onChoose}
        className={`relative flex w-full min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left ${FOCUS_RING} ${open || selected ? ROW_CHOSEN : ROW_ITEM}`}
      >
        {open && <span aria-hidden data-testid="open-bar" className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-text-primary" />}
        {selected !== undefined && (
          <span aria-hidden data-testid="row-tick" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${selected ? 'border-accent bg-accent text-on-accent' : 'border-field-border bg-field'}`}>
            {selected && <Check size={12} strokeWidth={3} />}
          </span>
        )}
        <InboxFace conversation={c} showPlace={showPlace} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-body text-text-primary ${c.unread > 0 ? 'font-medium' : ''}`}>{title}</span>
            <span className={`shrink-0 text-small ${c.unread > 0 ? 'font-medium text-text-primary' : 'text-text-muted'}`}>{rowTime(c.lastMessageAt)}</span>
          </span>
          <span className="flex items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-small ${c.needsYou > 0 && !showPlace ? 'text-warning' : 'text-text-secondary'}`}>{line || '\u00a0'}</span>
            {c.needsYou > 0
              ? <RowMark tone="needs">!</RowMark>
              : c.unread > 0 && <RowMark tone="unread">{countOf(c.unread)}</RowMark>}
          </span>
        </span>
      </button>
    </li>
  )
}

function RowMark({ tone, children }: { tone: 'needs' | 'unread'; children: ReactNode }) {
  return (
    <span
      aria-hidden
      data-testid={tone === 'needs' ? 'needs-mark' : 'unread-count'}
      className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-micro font-medium leading-none ${tone === 'needs' ? 'bg-warning text-on-accent' : 'bg-text-primary text-surface-1'}`}
    >
      {children}
    </span>
  )
}
