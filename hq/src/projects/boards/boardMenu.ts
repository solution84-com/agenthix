import type { OverflowItem } from '@agenthix/ui/tasks'
import type { BoardKind } from '@agenthix/ui/board'

export interface BoardMenuContext {
  kind: BoardKind
  archived: boolean
  canChange: boolean
  onEditColumns: () => void
  onArchive: () => Promise<void>
  onUnarchive: () => Promise<void>
  onDelete: () => Promise<void>
}

/**
 * Under a board's ⋯ (every screen reviewed spec §3): Edit columns, Archive and Delete. Project Tasks is the
 * default board — its columns are fixed and it is never archived, renamed or deleted — so it has none of them.
 */
export function boardMenuItems(ctx: BoardMenuContext): OverflowItem[] {
  if (ctx.kind === 'PROJECT_TASKS' || !ctx.canChange) return []
  if (ctx.archived) {
    return [
      { label: 'Unarchive', onSelect: ctx.onUnarchive },
      { label: 'Delete', danger: true, confirmLabel: 'Confirm: delete', onSelect: ctx.onDelete },
    ]
  }
  return [
    { label: 'Edit columns', onSelect: ctx.onEditColumns },
    { label: 'Archive', confirmLabel: 'Confirm: archive', onSelect: ctx.onArchive },
    { label: 'Delete', danger: true, confirmLabel: 'Confirm: delete', onSelect: ctx.onDelete },
  ]
}
