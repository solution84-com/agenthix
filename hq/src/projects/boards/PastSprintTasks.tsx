import { BoardCardView, type BoardCardData } from '@agenthix/ui/board'

/** A finished sprint's record, read-only: the tasks it holds, the done ones among them. */
export function PastSprintTasks({ tasks, now, onOpen }: { tasks: BoardCardData[] | undefined; now: Date; onOpen: (card: BoardCardData) => void }) {
  if (!tasks) return <p className="px-4 py-3 text-small text-text-muted">Loading…</p>
  if (tasks.length === 0) return <p className="px-4 py-3 text-small text-text-muted">No task was in this sprint.</p>
  return (
    <ul className="divide-y divide-border-subtle">
      {tasks.map(t => (
        <li key={t.id}><BoardCardView card={t} variant="row" now={now} onOpen={() => onOpen(t)} menu={[]} /></li>
      ))}
    </ul>
  )
}
