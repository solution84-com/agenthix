import type { ReactNode } from 'react'
import { groupByDay, type InboxConversation } from '../shared/conversations/inbox'

/** Rows (already newest first) under their day headings, so each row's own time can stay short. */
export function InboxDayList({ rows, label, row }: {
  rows: InboxConversation[]
  label: string
  row: (c: InboxConversation) => ReactNode
}) {
  return (
    <ul aria-label={label}>
      {groupByDay(rows).map((group) => (
        <li key={group.heading} role="presentation">
          <h3 className="px-2 pb-1 pt-3 text-micro font-semibold uppercase tracking-wide text-text-muted">{group.heading}</h3>
          <ul aria-label={`${label}, ${group.heading}`}>{group.rows.map(row)}</ul>
        </li>
      ))}
    </ul>
  )
}
