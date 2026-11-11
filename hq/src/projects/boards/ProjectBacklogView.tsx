import { useQuery, getBoardView } from 'wasp/client/operations'
import { EmptyState } from '@agenthix/ui/primitives'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { ViewCard } from '@agenthix/ui/board'
import type { BoardRead } from '../boardViewService'
import { viewCard } from './boardCards'

/**
 * Tasks › Backlog (T4, D11): the project's Backlog, every type, in the project's one order, read from the built-in task
 * state board's first column. A task opens from its card.
 */
export function ProjectBacklogView({ projectId, search, onOpen }: { projectId: string; search: string; onOpen: (taskKey: string) => void }) {
  const query = useQuery(getBoardView, { projectId, kind: 'STATE' })
  const failure = useBackgroundRead(query, { what: 'The Backlog' })
  const read: BoardRead | undefined = query.data
  if (!read) return failure.failedWithoutData ? failure.nudge : <p className="px-4 py-4 text-small text-text-muted">Loading…</p>
  const q = search.trim().toLowerCase()
  const cards = (read.columns.find(c => c.key === 'BACKLOG')?.cards ?? [])
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
    .map(viewCard)
  return (
    <div className="px-4 pt-3">
      {failure.nudge}
      {cards.length === 0
        ? <EmptyState variant="inline" title={q ? 'No task in the Backlog matches.' : 'The Backlog is empty. A new task starts here.'} />
        : (
          <ul className="flex flex-col gap-2">
            {cards.map(c => <li key={c.id}><ViewCard card={c} showType={read.mixesTypes} onOpen={() => onOpen(c.key)} menu={[]} /></li>)}
          </ul>
        )}
      <p className="py-3 text-small text-text-muted">Or ask in the conversation: "plan the backlog into Sprint 4".</p>
    </div>
  )
}
