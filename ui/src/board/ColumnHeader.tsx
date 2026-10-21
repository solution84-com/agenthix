import { ColumnMenu, type ColumnMenuItem } from './ColumnMenu'
import type { ShowAlsoPicker } from './ShowAlso'
import type { BoardColumnInfo } from './types'

/**
 * A column's heading: its name and count, "starts work" beside the name, and its own "⋯" — switching "starts
 * work", and for the Backlog "Show also…" and hiding it, for Done showing or hiding its tasks.
 */
export function ColumnHeader({ column, count, note, onToggleStarts, startsDisabledReason, items = [], showAlso }: {
  column: Pick<BoardColumnInfo, 'label' | 'status' | 'autoQueue'>
  count: number
  note?: string
  /** Absent where a column's work cannot be switched (Project Tasks, the Backlog, or a viewer). */
  onToggleStarts?: () => void
  startsDisabledReason?: string
  /** The column's other menu entries (hide the Backlog, show Done). */
  items?: ColumnMenuItem[]
  showAlso?: ShowAlsoPicker
}) {
  const canSwitch = !!onToggleStarts && column.status !== 'DONE'
  const startsItem = canSwitch && !startsDisabledReason
    ? [{ label: column.autoQueue ? 'Stop starting work here' : 'Start work on arrival', onSelect: () => onToggleStarts?.() }]
    : []
  const menuItems = [...startsItem, ...items]
  // One line that never wraps: a note ("not in a sprint") follows the count and is cut short before the menu is.
  return (
    <div className="text-small font-medium text-text-secondary">
      <div className="flex min-h-7 items-center gap-2 whitespace-nowrap">
        <span>{column.label}</span>
        <span className="min-w-0 truncate text-text-muted">{count}{note ? ` · ${note}` : ''}</span>
        {column.autoQueue && <span className="rounded-md bg-success/15 px-1.5 text-micro font-medium text-success">starts work</span>}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {canSwitch && startsDisabledReason && menuItems.length === 0 && !showAlso
            ? <span title={startsDisabledReason} className="text-micro text-text-muted">⋯</span>
            : <ColumnMenu label={`${column.label} column menu`} items={menuItems} showAlso={showAlso} />}
        </span>
      </div>
    </div>
  )
}
