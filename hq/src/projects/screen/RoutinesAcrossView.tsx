import { useState } from 'react'
import { Link } from 'react-router'
import { Repeat } from 'lucide-react'
import { useAction, useQuery, getRoutinesAcrossProjects, pauseRoutine, resumeRoutine } from 'wasp/client/operations'
import { FilterSelect, PlaceAvatar } from '@agenthix/ui/primitives'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { RoutineSquares, roundWhen, ruleSentence, type ScheduleRuleInput } from '@agenthix/ui/tasks'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import type { RoutineAcross } from '../../shared/routineTypes'
import { routineAddress } from '../../automation/pages/routineAddress'
import { routinePlaceValue, visibleRoutines } from './acrossLists'
import { ListControls } from './ListControls'
import { useAcrossListUrl } from './acrossListUrl'

// Tailwind reads class names from the source, so each grid is written out whole; the second adds Last 10, drawn once
// any routine shown has run.
const GRID = 'md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)] md:items-center md:gap-4'
const GRID_WITH_ROUNDS = 'md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:items-center md:gap-4'

const STATES: Array<{ value: 'on' | 'paused' | null; label: string }> = [
  { value: null, label: 'All' }, { value: 'on', label: 'On' }, { value: 'paused', label: 'Paused' },
]

function nextText(r: RoutineAcross): string {
  if (!r.enabled) return r.pausedReason ? 'Paused — needs a project admin' : 'Paused'
  return r.nextRoundAt ? roundWhen(r.nextRoundAt) : 'On'
}

function RoutineRow({ r, busy, rounds, onToggle }: { r: RoutineAcross; busy: boolean; rounds: boolean; onToggle: (on: boolean) => void }) {
  const repeats = ruleSentence(r.rule as ScheduleRuleInput | null)
  const person = r.onBehalfOf.username ?? 'someone'
  return (
    <li className="flex items-start gap-3 border-b border-border-subtle px-1 py-2.5 hover:bg-surface-hover md:items-center">
      <span className="mt-0.5 flex md:mt-0">
        <AutomationSwitch
          label={`${r.title} on`}
          on={r.enabled}
          disabled={!r.canManage || busy || (!r.enabled && !!r.pausedReason)}
          onChange={onToggle}
        />
      </span>
      <Link to={routineAddress({ key: r.project.key }, r.id)} className={`block min-w-0 flex-1 ${rounds ? GRID_WITH_ROUNDS : GRID}`}>
        <b className="block truncate text-body font-semibold text-text-primary">{r.title}</b>
        <span className="flex min-w-0 items-center gap-2 text-small text-text-secondary">
          <PlaceAvatar kind="project" id={r.project.id} name={r.project.name} size="xs" />
          <span className="truncate">{r.project.name}</span>
          <span className="truncate text-text-muted md:hidden">· {repeats}</span>
        </span>
        <span className="hidden truncate text-small text-text-muted md:block">{repeats}</span>
        <span className="hidden truncate text-small text-text-muted md:block">{person}</span>
        <span className={`block truncate text-small ${r.enabled ? 'text-text-secondary' : r.pausedReason ? 'text-warning' : 'text-text-muted'}`}>
          {nextText(r)}
          <span className="text-text-muted md:hidden"> · for {person}</span>
        </span>
        {rounds && <span className="mt-1 block md:mt-0">{r.lastRounds.length > 0 && <RoutineSquares states={r.lastRounds} small />}</span>}
      </Link>
    </li>
  )
}

/**
 * Every routine in the person's projects and in their own Chat: its switch, name, place, when it repeats, who it runs
 * for, its next round, and its last 10 rounds once any of those shown has run. Opening one goes into its place
 * with it open inside the Automation tool.
 */
export function RoutinesAcrossView() {
  const { screen, filter } = useAcrossListUrl()
  const { data, isLoading, refetch } = useQuery(getRoutinesAcrossProjects)
  const pauseFn = useAction(pauseRoutine)
  const resumeFn = useAction(resumeRoutine)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const all = (data ?? []) as RoutineAcross[]
  const shown = visibleRoutines(all, { place: screen.place, state: screen.state, search })
  const places = new Map(all.map(r => [routinePlaceValue(r), r.project.name]))
  const rounds = shown.some(r => r.lastRounds.length > 0)

  const toggle = async (routineId: string, on: boolean) => {
    setBusyId(routineId)
    setError('')
    try {
      await (on ? resumeFn({ routineId }) : pauseFn({ routineId }))
      await refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ListControls search={search} onSearch={setSearch} searchLabel="Search routines">
        {places.size > 1 && (
          <FilterSelect label="Project" value={screen.place ?? ''} onChange={v => filter({ place: v || null })}>
            <option value="">All projects</option>
            {[...places].map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </FilterSelect>
        )}
        <div role="group" aria-label="On or paused" className="inline-flex overflow-hidden rounded-lg border border-border">
          {STATES.map(o => (
            <button
              key={o.label} type="button" aria-pressed={screen.state === o.value} onClick={() => filter({ state: o.value })}
              className={`px-3 py-1.5 text-small [&:not(:first-child)]:border-l [&:not(:first-child)]:border-border ${
                screen.state === o.value ? 'bg-accent/10 font-medium text-text-primary' : 'bg-surface-1 text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </ListControls>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {isLoading && !data ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={all.length === 0 ? 'No routines yet' : 'No routines match'}
          hint={all.length === 0 ? 'New routine sets one up in a project or in Chat.' : undefined}
        />
      ) : (
        <div>
          <div className="hidden border-b border-border-subtle pb-1.5 pl-[52px] pr-1 text-micro font-medium uppercase tracking-wide text-text-muted md:block">
            <div className={rounds ? GRID_WITH_ROUNDS : GRID}>
              <span>Routine</span><span>Project</span><span>Repeats</span><span>On behalf of</span><span>Next round</span>{rounds && <span>Last 10</span>}
            </div>
          </div>
          <ul>{shown.map(r => <RoutineRow key={r.id} r={r} busy={busyId === r.id} rounds={rounds} onToggle={on => void toggle(r.id, on)} />)}</ul>
        </div>
      )}
    </>
  )
}
