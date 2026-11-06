import { FOCUS_RING, SCROLL_EDGE_FADE } from '../primitives/controlStyles'
import type { TaskListCard } from './taskListTypes'
import type { Scorecard } from './taskListWords'

/**
 * How many tasks stand in each state, at once (T7 ①); each card is also the quick filter. A card is highlighted as a
 * card is: hover turns its outline the accent colour, and the chosen one keeps it with the accent's light fill. From
 * `sm` up the cards share the row and shrink to fit it; on a phone the row scrolls sideways.
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
    <div
      role="group" aria-label="Tasks by state"
      className={`flex gap-2 overflow-x-auto px-4 pt-4 sm:grid sm:grid-cols-[repeat(auto-fit,minmax(6rem,1fr))] sm:overflow-visible ${SCROLL_EDGE_FADE}`}
    >
      {cards.map(c => {
        const on = c.card === chosen
        return (
          <button
            key={c.label}
            type="button"
            aria-pressed={on}
            onClick={() => onChoose(c.card)}
            disabled={loading || failed}
            className={`flex min-w-[7.5rem] shrink-0 flex-col justify-start rounded-xl border px-3 py-2 text-left hover:border-accent sm:min-w-0 ${FOCUS_RING} ${
              on ? 'border-accent bg-accent-subtle' : 'border-border bg-card'
            }`}
          >
            <span className="block truncate text-micro font-medium text-text-secondary">{c.label}</span>
            <span className="block text-h2 font-semibold leading-tight text-text-primary">{failed ? '–' : loading ? '…' : c.count}</span>
            <span className="block truncate text-micro text-text-muted">{(matching && c.card === null ? 'matching' : c.detail) ?? '\u00a0'}</span>
          </button>
        )
      })}
    </div>
  )
}
