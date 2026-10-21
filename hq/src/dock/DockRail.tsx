import { MessageSquare } from 'lucide-react'
import { useQuery, getConversation } from 'wasp/client/operations'
import { AuthedAgentAvatar } from '../shared/components/AuthedAgentAvatar'
import type { ThreadActivity } from '../conversations/components/ConversationThread'

/**
 * The collapsed dock (spec §11): the agent, a dot while work is under way, the approvals waiting, as the thread —
 * still mounted behind the rail — reports them. Opens on click.
 */
export function DockRail({ conversationId, activity: signals, onOpen }: {
  conversationId: string | null
  activity: ThreadActivity
  onOpen: () => void
}) {
  const { data: view } = useQuery(getConversation, { conversationId: conversationId ?? '' }, { enabled: !!conversationId })
  const agent = conversationId ? view?.agent ?? null : null
  const label = [
    'Open the conversation (⌘J)',
    signals.working ? 'work under way' : null,
    signals.needYou ? `${signals.needYou} waiting for your okay` : null,
  ].filter(Boolean).join(', ')
  return (
    <button
      type="button"
      data-testid="dock-rail"
      aria-label={label}
      title={label}
      onClick={onOpen}
      className="flex w-full flex-1 flex-col items-center gap-2 py-3 hover:bg-surface-hover"
    >
      <span className="relative">
        {agent ? <AuthedAgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="sm" /> : <MessageSquare size={18} aria-hidden className="text-text-secondary" />}
        {signals.working && (
          <span data-testid="dock-rail-working" aria-hidden className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface-0" />
        )}
      </span>
      {signals.needYou > 0 && (
        <span data-testid="dock-rail-waiting" className="min-w-5 rounded-full bg-warning px-1.5 text-center text-micro font-medium text-on-accent">
          {signals.needYou}
        </span>
      )}
    </button>
  )
}
