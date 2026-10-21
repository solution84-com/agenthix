import type { BoardColumnCount } from './types'

/** A column's colour comes from the state it maps to, so a board reads the same in light and dark. */
const STATE_FILL: Record<string, string> = {
  TODO: 'bg-text-muted',
  IN_PROGRESS: 'bg-warning',
  DONE: 'bg-success',
}

/** How many tasks sit in each place on a board: the Backlog, then each column, as one bar. */
export function ColumnBar({ backlogCount, columns }: { backlogCount: number; columns: BoardColumnCount[] }) {
  const parts = [
    { key: '__backlog__', label: 'Backlog', count: backlogCount, fill: 'bg-surface-3' },
    ...columns.map(c => ({ key: c.name, label: c.label, count: c.count, fill: STATE_FILL[c.status] ?? 'bg-text-muted' })),
  ].filter(p => p.count > 0)
  return (
    <div role="img" aria-label="Tasks in each column" className="flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-2">
      {parts.map(p => (
        <i key={p.key} title={`${p.label} ${p.count}`} className={`block ${p.fill}`} style={{ flex: p.count }} />
      ))}
    </div>
  )
}
