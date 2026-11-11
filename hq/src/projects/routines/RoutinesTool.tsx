import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import { useQuery, getProjectRoutines } from 'wasp/client/operations'
import { Button, EmptyState, UnansweredSitesNotice } from '@agenthix/ui/primitives'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { unansweredSitesCopy } from '../../shared/siteSilence'
import type { RoutineSummary } from '../../shared/routineTypes'
import { usePlaceTopBarAdd } from '../../places/placeCrumb'
import type { PlaceRef } from '../placeAddresses'
import { useWorkroomClock } from '../workroom/useWorkroomLive'
import { RoutineCard } from './RoutineCard'
import { RoutineOrderList } from './RoutineOrderList'
import { RoutineScreen } from './RoutineScreen'
import { RoutinesGlance } from './RoutinesGlance'
import { filterRoutines, type RoutineFilter } from './routineListWords'
import { newRoutineHref, routineHref } from './routineAddresses'
import { useRoutineActs } from './useRoutineActs'
import { ROUTINES_REFRESH_MS, useMe, useRoutineFacts } from './useRoutineFacts'
import { useBackgroundRead } from '@agenthix/ui/attention'

export const ROUTINES_SUBTITLE = 'Runs that repeat: on a schedule, an agent does what its instructions say. Each time is one run, shown in the Workroom and in Runs.'
export const NO_ROUTINES = 'No routines yet. A routine has an agent do the same thing on a schedule, for example “every weekday at 9:00, check the site\'s links and report what is broken”.'

/**
 * A place's Routines (spec D7, D15, D22, N6; the Routines design): the counts and Up next, then a card per routine in
 * the project's own order, which whoever may work in it changes by dragging or with Move up and Move down;
 * a routine opens at its own address in the section (`&routine=<id>`), where its page is its edit screen. New routine
 * is the page's one filled button, and on a phone the first item of the top bar's ⋯.
 */
export function RoutinesTool({ projectId, projectKey, placeName, place, space = false }: {
  projectId: string
  projectKey: string
  placeName: string
  place: PlaceRef
  /** The person's own space, whose New routine comes back to it. */
  space?: boolean
}) {
  const [params] = useSearchParams()
  const routineId = params.get('routine')
  if (routineId) return <RoutineScreen key={routineId} routineId={routineId} place={place} placeName={placeName} />
  return <RoutinesList projectId={projectId} projectKey={projectKey} place={place} space={space} />
}

function RoutinesList({ projectId, projectKey, place, space }: { projectId: string; projectKey: string; place: PlaceRef; space: boolean }) {
  const navigate = useNavigate()
  const me = useMe()
  const mayWork = useMayWork(projectId)
  const { now, todayFrom } = useWorkroomClock()
  const query = useQuery(getProjectRoutines, { projectId }, { refetchInterval: ROUTINES_REFRESH_MS })
  const { data, refetch } = query
  const read = useBackgroundRead(query, { what: 'The routines', pollMs: ROUTINES_REFRESH_MS })
  const { facts, cost, about } = useRoutineFacts({ projectId }, todayFrom)
  const acts = useRoutineActs({ me, refetch })
  const [filter, setFilter] = useState<RoutineFilter>(null)
  const routines = data as RoutineSummary[] | undefined
  const newWhy = mayWork ? undefined : VIEWER_CANNOT_WORK
  const toNew = () => navigate(newRoutineHref(projectKey, space))
  const onPhone = usePlaceTopBarAdd(newWhy ? null : { label: 'New routine', onClick: toNew })

  if (read.failedWithoutData) return read.nudge
  if (!routines) return <p className="px-6 py-6 text-small text-text-muted max-lg:px-3">Reading the routines…</p>
  const shown = filterRoutines(routines, filter)
  const hrefOf = (r: RoutineSummary) => routineHref(place, r.id)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4 max-lg:px-3 max-lg:pb-3 max-lg:pt-3">
        <div className={`flex items-start gap-3 ${onPhone ? 'max-lg:hidden' : ''}`}>
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 font-medium text-text-primary">Routines</h2>
            <p className="text-small text-text-muted">{ROUTINES_SUBTITLE}</p>
          </div>
          <Button leadingIcon={<Plus size={14} aria-hidden />} disabled={!!newWhy} title={newWhy} onClick={toNew}>New routine</Button>
        </div>

        {read.nudge}
        {routines.length === 0 ? (
          <EmptyState variant="inline" title={NO_ROUTINES} />
        ) : (
          <>
            <RoutinesGlance routines={routines} today={facts?.today ?? null} now={now} filter={filter} onFilter={setFilter} hrefOf={hrefOf} />
            <UnansweredSitesNotice copy={unansweredSitesCopy(facts?.unanswered ?? [], "the routines' costs")} />
            <div className="border-t border-border-subtle" />
            {shown.length === 0 ? (
              <EmptyState variant="inline" title="No routine here is like that now." action={<Button variant="secondary" onClick={() => setFilter(null)}>Show every routine</Button>} />
            ) : (
              <RoutineOrderList
                routines={shown}
                onReorder={mayWork && filter === null ? ids => void acts.reorder(projectId, ids) : undefined}
                card={(r, order) => (
                  <RoutineCard
                    routine={r} about={about(r.id)} href={hrefOf(r)} me={me} now={now} cost={cost} order={order}
                    acts={{
                      onToggle: on => void acts.change(r, { enabled: on }),
                      onRunNow: () => void acts.runNow(r),
                      onDelete: () => void acts.remove(r),
                      busy: acts.busyId === r.id,
                      viewerWhy: VIEWER_CANNOT_WORK,
                    }}
                  />
                )}
              />
            )}
          </>
        )}
      </div>
      {acts.dialog}
    </div>
  )
}
