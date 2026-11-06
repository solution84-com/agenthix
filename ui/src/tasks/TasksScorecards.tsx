import type { TaskListCard } from './taskListTypes'
import type { Scorecard } from './taskListWords'

/**
 * How many tasks stand in each state, at once (T7 ①); each card is also the quick filter, and the chosen one is
 * outlined. On a phone the row scrolls sideways.
 */
export function TasksScorecards({ cards, chosen, onChoose }: {
  cards: Scorecard[]
  chosen: TaskListCard | null
  onChoose: (card: TaskListCard | null) => void
}) {
  return (
    <div role="group" aria-label="Tasks by state" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
      {cards.map(c => {
        const on = c.card === chosen
        return (
          <button
            key={c.label}
            type="button"
            aria-pressed={on}
            onClick={() => onChoose(c.card)}
            className={`min-w-[7.5rem] shrink-0 rounded-xl border bg-card px-3 py-2 text-left hover:bg-surface-hover sm:flex-1 ${
              on ? 'border-border-strong ring-1 ring-border-strong' : 'border-border-subtle'
            }`}
          >
            <span className="block text-micro font-medium text-text-secondary">{c.label}</span>
            <span className="block text-h2 font-semibold leading-tight text-text-primary">{c.count}</span>
            <span className="block truncate text-micro text-text-muted">{c.detail ?? ' '}</span>
          </button>
        )
      })}
    </div>
  )
}
