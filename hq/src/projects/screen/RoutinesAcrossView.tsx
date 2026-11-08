import { useState } from 'react'
import { useQuery, getRoutinesAcrossProjects } from 'wasp/client/operations'
import { EmptyState, FilterSelect, PlaceAvatar, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { refusalText } from '../../shared/refusal'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import type { RoutineAcross } from '../../shared/routineTypes'
import { useWorkroomClock } from '../workroom/useWorkroomLive'
import { RoutineCard } from '../routines/RoutineCard'
import { RoutinesGlance } from '../routines/RoutinesGlance'
import { routineHref } from '../routines/routineAddresses'
import { filterRoutines, type RoutineFilter } from '../routines/routineListWords'
import { useRoutineActs } from '../routines/useRoutineActs'
import { ROUTINES_REFRESH_MS, useMe, useRoutineFacts } from '../routines/useRoutineFacts'
import { routinePlaceValue, visibleRoutines } from './acrossLists'
import { ListControls } from './ListControls'
import { useAcrossListUrl } from './acrossListUrl'

type Group = { id: string; key: string; name: string; routines: RoutineAcross[] }

/** Each project's routines under its name, the projects by name; the person's own space's are under Your space. */
function byProject(routines: RoutineAcross[]): Group[] {
  const groups = new Map<string, Group>()
  for (const r of routines) {
    if (!r.project.key) continue
    const g = groups.get(r.project.id) ?? { id: r.project.id, key: r.project.key, name: r.project.name, routines: [] }
    g.routines.push(r)
    groups.set(r.project.id, g)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Routines, the rail place (spec D20; the Routines place design): every routine in the person's projects, with the
 * counts and Up next across all of them, a search and a project filter, then each project's cards under its name.
 * The cards are a project's Routines cards, with no drag handle: their order is the project's. A routine opens in its
 * project's Routines. A routine in the person's own space is under Your space › Routines, not here.
 */
export function RoutinesAcrossView() {
  const { screen, filter: filterUrl } = useAcrossListUrl()
  const me = useMe()
  const { now, todayFrom } = useWorkroomClock()
  const { data, error, refetch } = useQuery(getRoutinesAcrossProjects, undefined, { refetchInterval: ROUTINES_REFRESH_MS })
  const { facts, cost, about } = useRoutineFacts({}, todayFrom)
  const acts = useRoutineActs({ me, refetch })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<RoutineFilter>(null)
  if (error) return <p role="alert" className="text-body text-text-secondary">{refusalText(error, 'The routines could not be read. Try again.')}</p>
  if (!data) return <p className="text-small text-text-muted">Reading the routines…</p>

  const all = (data as RoutineAcross[]).filter(r => r.project.key)
  const places = new Map(all.map(r => [routinePlaceValue(r), r.project.name]))
  const inPlace = visibleRoutines(all, { place: screen.place, state: null, search })
  const groups = byProject(filterRoutines(inPlace, filter))
  const hrefOf = (r: RoutineAcross) => routineHref({ key: r.project.key }, r.id)

  if (all.length === 0) return <EmptyState variant="inline" title="No routines yet. New routine sets one up in a project." />
  return (
    <div className="flex flex-col gap-4">
      <RoutinesGlance routines={all} today={facts?.today ?? null} now={now} filter={filter} onFilter={setFilter} hrefOf={hrefOf} />
      <UnansweredSitesNotice copy={unansweredSitesCopy(facts?.unanswered ?? [], "the routines' costs")} />
      <ListControls search={search} onSearch={setSearch} searchLabel="Search routines">
        <FilterSelect label="Project" value={screen.place ?? ''} onChange={v => filterUrl({ place: v || null })}>
          <option value="">All projects</option>
          {[...places].map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </FilterSelect>
      </ListControls>
      <div className="border-t border-border-subtle" />
      {groups.length === 0 ? (
        <EmptyState variant="inline" title="No routine matches." />
      ) : groups.map(g => (
        <section key={g.id} aria-label={g.name} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-body font-medium text-text-primary">
            <PlaceAvatar kind="project" id={g.id} name={g.name} size="xs" />{g.name}<span className="font-normal text-text-muted">· {g.routines.length}</span>
          </h3>
          {g.routines.map(r => (
            <RoutineCard
              key={r.id} routine={r} about={about(r.id)} href={hrefOf(r)} me={me} now={now} cost={cost}
              acts={{
                onToggle: on => void acts.change(r, { enabled: on }),
                onRunNow: () => void acts.runNow(r),
                onDelete: () => void acts.remove(r),
                busy: acts.busyId === r.id,
                viewerWhy: VIEWER_CANNOT_WORK,
              }}
            />
          ))}
        </section>
      ))}
      {acts.dialog}
    </div>
  )
}
