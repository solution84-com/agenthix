import { ConversationMenu } from './ConversationMenu'

/** What sits at the end of the conversation's header: its ⋯ menu, which holds everything else, Delete included. */
export function ConversationHeaderTools({ canDelete, onDelete, canRename = false, onRename, canSummarise = false, summarising = false, onSummarise, keep, onToggleKeep, runsHref, onArchive }: {
  canDelete: boolean
  onDelete: () => void
  /** Whether the viewer may give it a name of their own: whoever may write in it. */
  canRename?: boolean
  onRename?: () => void
  /** Whether the viewer may fold the older messages into a summary now: they can write in an open conversation. */
  canSummarise?: boolean
  summarising?: boolean
  onSummarise?: () => void
  /** The menu's archive and runs entries (archive lane): whether it is kept out of archiving, its toggle, and where its runs are. */
  keep?: boolean
  onToggleKeep?: () => void
  runsHref?: string
  /** Archiving by hand, for the one who opened it. */
  onArchive?: () => void
}) {
  const renames = canRename ? onRename : undefined
  const summarises = canSummarise ? onSummarise : undefined
  if (!renames && !summarises && !onToggleKeep && !runsHref && !canDelete) return null
  return (
    <div className="flex shrink-0 items-center" data-testid="conversation-header-tools">
      <ConversationMenu
        busy={summarising}
        onRename={renames}
        onSummarise={summarises}
        keep={keep}
        onToggleKeep={onToggleKeep}
        runsHref={runsHref}
        onArchive={canDelete ? onArchive : undefined}
        onDelete={canDelete ? onDelete : undefined}
      />
    </div>
  )
}
