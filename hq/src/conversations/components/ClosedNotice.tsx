import { Link } from 'react-router'
import { MessageSquarePlus } from 'lucide-react'
import { closedNotice } from '../closedCopy'
import type { ConversationStatusValue } from '../../shared/conversations/protocol'

/** In place of the message box on a closed conversation: why, and a way to start a new one with the same agent. */
export function ClosedNotice({ status, reason, newConversationHref }: { status: ConversationStatusValue; reason: string | null; newConversationHref: string }) {
  const notice = closedNotice(status, reason)
  if (!notice) return null
  return (
    <div className="shrink-0 border-t border-border-subtle p-3" role="status" data-testid="closed-notice">
      <p className="text-body font-medium text-text-primary">{notice.headline}</p>
      <p className="mt-1 text-small leading-relaxed text-text-secondary">{notice.detail}</p>
      <Link
        to={newConversationHref}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-small font-medium text-on-accent hover:bg-accent-hover max-lg:min-h-10"
      >
        <MessageSquarePlus size={12} aria-hidden />
        Start a new conversation with this agent
      </Link>
    </div>
  )
}
