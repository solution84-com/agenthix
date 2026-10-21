import { ROUND_STATE_WORDS, roundsSummary, type RoutineRoundState } from './RoutineWords'

const SQUARE: Record<RoutineRoundState, string> = {
  done: 'bg-success',
  failed: 'bg-danger',
  needsYou: 'bg-warning',
  running: 'bg-accent',
  waiting: 'border border-dashed border-text-muted bg-surface-3',
}

/**
 * A routine's last rounds as squares, oldest first (every screen reviewed spec
 * §3): done, failed, needs you, running, and the one waiting. With `summary`,
 * the counts in words under them.
 */
export function RoutineSquares({ states, small, summary }: { states: RoutineRoundState[]; small?: boolean; summary?: boolean }) {
  const words = roundsSummary(states)
  if (states.length === 0) return summary ? <p className="text-micro text-text-muted">{words}</p> : null
  const size = small ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-3 w-3 rounded-[3px]'
  return (
    <div>
      <span role="img" aria-label={words} title={words} className={`inline-flex ${small ? 'gap-[3px]' : 'gap-1'}`}>
        {states.map((s, i) => <i key={i} data-state={s} title={ROUND_STATE_WORDS[s]} className={`inline-block ${size} ${SQUARE[s]}`} />)}
      </span>
      {summary && <p className="mt-1 text-micro text-text-muted">{words}</p>}
    </div>
  )
}
