import { Link } from 'react-router'
import { FOCUS_RING, Scorecards } from '@agenthix/ui/primitives'
import { EDGE_FADE } from './routineStyles'
import type { RoutineSummary } from '../../shared/routineTypes'
import type { RoutineRunFacts } from './routineRunFactsRules'
import { routineCounts, upNext, type RoutineFilter } from './routineListWords'
import { whenWords } from './routineWords'

const CHIP = `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface-1 px-3 text-small text-text-secondary hover:border-accent max-sm:h-11 ${FOCUS_RING}`

/**
 * The top of a list of routines (the Routines design keys 1, 2): the counts, three of them also filters of the list,
 * then Up next, the next three firings in time order, each in its routine's timezone, opening its routine. On a phone both rows scroll sideways.
 */
export function RoutinesGlance<R extends RoutineSummary>({ routines, today, now, filter, onFilter, hrefOf }: {
  routines: R[]
  today: RoutineRunFacts['today'] | null
  now: Date
  filter: RoutineFilter
  onFilter: (f: RoutineFilter) => void
  hrefOf: (r: R) => string
}) {
  const items = routineCounts(routines, today).map(c => ({
    key: c.key,
    label: c.label,
    count: c.of ? <>{c.count} <small className="text-small font-normal text-text-muted">{c.of}</small></> : c.count,
    detail: c.detail,
    onChoose: c.filter ? () => onFilter(filter === c.filter ? null : c.filter) : undefined,
    chosen: !!c.filter && filter === c.filter,
  }))
  const next = upNext(routines, now)
  return (
    <div className="flex flex-col gap-4">
      <Scorecards label="Routines at a glance" items={items} className="" />
      {next.length > 0 && (
        <div className={`flex items-center gap-2 max-sm:overflow-x-auto sm:flex-wrap ${EDGE_FADE}`}>
          <span className="mr-2 shrink-0 text-micro font-medium uppercase tracking-wide text-text-muted">Up next</span>
          {next.map(({ routine, at }) => (
            <Link key={`${routine.id}-${at.getTime()}`} to={hrefOf(routine)} className={CHIP}>
              <span className="font-semibold text-text-primary">{whenWords(at, now, { timeZone: routine.timezone })}</span> · {routine.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
