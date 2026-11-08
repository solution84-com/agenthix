/**
 * The counts and Up next over a list of routines (the Routines design keys 1, 2; the Routines place across projects):
 * Routines on, Needs you, Failing, Ran today, Spent today, and the next three firings in time order, whatever the
 * cards' order. Pure.
 */
import { nextCronTimes, parseCron } from '@agenthix/core'
import type { RoutineSummary } from '../../shared/routineTypes'
import { costText } from '../workroom/workroomWords'
import { askingRun, failedInARow } from './routineWords'
import type { RoutineRunFacts } from './routineRunFactsRules'

export type RoutineCountKey = 'on' | 'needs' | 'failing' | 'ran' | 'spent'
/** A count that is also a filter of the list. */
export type RoutineFilter = 'on' | 'needs' | 'failing' | null

export type RoutineCount = { key: RoutineCountKey; label: string; count: string; of?: string; detail: string; filter: RoutineFilter }

const needs = (r: RoutineSummary) => !!askingRun(r)
const failing = (r: RoutineSummary) => failedInARow(r) > 0

export function routineCounts(routines: RoutineSummary[], today: RoutineRunFacts['today'] | null): RoutineCount[] {
  const on = routines.filter(r => r.enabled).length
  const off = routines.length - on
  const ran = today ? String(today.ran) : '…'
  return [
    { key: 'on', label: 'Routines on', count: String(on), of: `of ${routines.length}`, detail: off ? `${off} ${off === 1 ? 'is' : 'are'} off` : 'all on', filter: 'on' },
    { key: 'needs', label: 'Needs you', count: String(routines.filter(needs).length), detail: 'show only them', filter: 'needs' },
    { key: 'failing', label: 'Failing', count: String(routines.filter(failing).length), detail: 'failed its last run', filter: 'failing' },
    { key: 'ran', label: 'Ran today', count: ran, detail: today ? (today.running ? `${today.running} running now` : 'none running now') : ' ', filter: null },
    { key: 'spent', label: 'Spent today', count: today ? costText(today.spent) : '…', detail: today ? `on ${today.ran} ${today.ran === 1 ? 'run' : 'runs'}` : ' ', filter: null },
  ]
}

export function filterRoutines<R extends RoutineSummary>(routines: R[], filter: RoutineFilter): R[] {
  if (filter === 'on') return routines.filter(r => r.enabled)
  if (filter === 'needs') return routines.filter(needs)
  if (filter === 'failing') return routines.filter(failing)
  return routines
}

export type UpNext<R> = { routine: R; at: Date }

/** The next `count` firings across the routines that are on, soonest first; one routine may come more than once. */
export function upNext<R extends Pick<RoutineSummary, 'id' | 'enabled' | 'cron' | 'timezone'>>(routines: R[], now: Date, count = 3): UpNext<R>[] {
  const all = routines.flatMap(routine => {
    if (!routine.enabled) return []
    const parsed = parseCron(routine.cron)
    return parsed.ok ? nextCronTimes(parsed.rule, routine.timezone, now, count).map(at => ({ routine, at })) : []
  })
  return all.sort((a, b) => a.at.getTime() - b.at.getTime() || a.routine.id.localeCompare(b.routine.id)).slice(0, count)
}
