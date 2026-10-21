import { Trash2 } from 'lucide-react'
import { ConversationMenu } from './ConversationMenu'

/** What sits at the end of the conversation's header: its menu, and Delete for the one who opened it. */
export function ConversationHeaderTools({ canDelete, onDelete, canSummarise = false, summarising = false, onSummarise, keep, onToggleKeep, runsHref }: {
  canDelete: boolean
  onDelete: () => void
  /** Whether the viewer may fold the older messages into a summary now: they can write in an open conversation. */
  canSummarise?: boolean
  summarising?: boolean
  onSummarise?: () => void
  /** The menu's archive and runs entries (archive lane): whether it is kept out of archiving, its toggle, and where its runs are. */
  keep?: boolean
  onToggleKeep?: () => void
  runsHref?: string
}) {
  const hasMenu = (canSummarise && !!onSummarise) || !!onToggleKeep || !!runsHref
  if (!canDelete && !hasMenu) return null
  return (
    <div className="flex shrink-0 items-center gap-2" data-testid="conversation-header-tools">
      {hasMenu && (
        <ConversationMenu busy={summarising} onSummarise={canSummarise ? onSummarise : undefined} keep={keep} onToggleKeep={onToggleKeep} runsHref={runsHref} />
      )}
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 text-small text-text-muted hover:text-danger max-lg:min-h-10"
        >
          <Trash2 size={14} aria-hidden />
          Delete
        </button>
      )}
    </div>
  )
}
