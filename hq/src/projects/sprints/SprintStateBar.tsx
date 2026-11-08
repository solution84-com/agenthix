import type { TaskState } from '@agenthix/core'
import { barParts, tasksText, type StateCounts } from './sprintWords'

// A state's colour only repeats its words: the board list's spread uses the same fills.
const FILL: Record<TaskState, string> = {
  BACKLOG: 'bg-surface-3', TODO: 'bg-text-muted', IN_PROGRESS: 'bg-warning', DONE: 'bg-success',
}

/**
 * How a sprint is going, by task state across every type (spec D2): one bar, then its counts in words. Done always
 * means done; what runs now is not counted here.
 */
export function SprintStateBar({ counts }: { counts: StateCounts }) {
  const parts = barParts(counts)
  const label = parts.map(p => `${p.label} ${p.count}`).join(', ')
  return (
    <div>
      <div role="img" aria-label={label} className="flex h-1.5 gap-px overflow-hidden rounded-full bg-surface-2">
        {parts.filter(p => p.count > 0).map(p => (
          <i key={p.state} title={`${p.label} ${p.count}`} className={`block ${FILL[p.state]}`} style={{ flex: p.count }} />
        ))}
      </div>
      <p className="mt-2 text-small text-text-secondary">
        {parts.map((p, i) => (
          <span key={p.state}>
            {i > 0 && ' · '}
            <span aria-hidden className={`mr-1 inline-block h-2 w-2 rounded-sm ${FILL[p.state]}`} />
            {p.label} {p.count}
          </span>
        ))}
        {' · '}<span className="text-text-muted">{tasksText(counts.total)}</span>
      </p>
    </div>
  )
}
