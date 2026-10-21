import { MessageSquare } from 'lucide-react'
import { useQuery, getConversation } from 'wasp/client/operations'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'
import type { ThreadActivity } from '../conversations/components/ConversationThread'

/**
 * The conversation put away on a narrow window (spec §12): a pill at the bottom of every screen with its agent, its
 * title and a dot while work is under way. Tapping it shows the conversation full screen again.
 */
export function DockPill({ conversationId, activity: signals, onOpen }: {
  conversationId: string | null
  activity: ThreadActivity
  onOpen: () => void
}) {
  const { data: view } = useQuery(getConversation, { conversationId: conversationId ?? '' }, { enabled: !!conversationId })
  const agent = conversationId ? view?.agent ?? null : null
  const title = (conversationId && view?.title) || 'New conversation'
  return (
    <button
      type="button"
      data-testid="dock-pill"
      onClick={onOpen}
      aria-label={`Open the conversation: ${title}${signals.working ? ', work under way' : ''}`}
      className="flex min-h-10 w-full items-center gap-2 rounded-full border border-border-subtle bg-surface-1 px-3 py-1.5 text-left hover:bg-surface-hover"
    >
      {agent ? <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" /> : <MessageSquare size={16} aria-hidden className="shrink-0 text-text-secondary" />}
      <span className="min-w-0 flex-1 truncate text-small">
        {agent && <span className="font-medium text-text-primary">{agent.name}</span>}
        {agent && <span aria-hidden className="px-1.5 text-text-muted">·</span>}
        <span className="text-text-secondary">{title}</span>
      </span>
      {signals.working && <span data-testid="dock-pill-working" aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-success" />}
      {signals.needYou > 0 && (
        <span className="min-w-5 shrink-0 rounded-full bg-warning px-1.5 text-center text-micro font-medium text-on-accent">{signals.needYou}</span>
      )}
    </button>
  )
}
