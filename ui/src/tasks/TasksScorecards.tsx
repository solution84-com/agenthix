import { Scorecards } from '../primitives/Scorecards'
import type { TaskListCard } from './taskListTypes'
import type { Scorecard } from './taskListWords'

/**
 * How many tasks stand in each state, at once (T7 ①); each card is also the quick filter. Drawn by the one row of
 * counts (`Scorecards`), as a Workroom's are.
 */
export function TasksScorecards({ cards, chosen, onChoose, loading = false, failed = false, matching = false }: {
  cards: Scorecard[]
  chosen: TaskListCard | null
  onChoose: (card: TaskListCard | null) => void
  /** The counts are not read yet: the cards keep their place, each count an ellipsis. */
  loading?: boolean
  /** The read failed: the cards keep their place, with no number. */
  failed?: boolean
  /** A search or filter is on: the counts are of what matches, and All says so. */
  matching?: boolean
}) {
  return (
    <Scorecards
      label="Tasks by state"
      items={cards.map(c => ({
        key: c.label,
        label: c.label,
        count: failed ? '–' : loading ? '…' : c.count,
        detail: (matching && c.card === null ? 'matching' : c.detail) ?? undefined,
        onChoose: () => onChoose(c.card),
        chosen: c.card === chosen,
        disabled: loading || failed,
      }))}
    />
  )
}
