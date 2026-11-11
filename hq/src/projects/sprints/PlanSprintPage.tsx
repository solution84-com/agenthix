import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAction, useQuery, getProjectSprints, getProjectSprintTasks, getSprintPlanning, updateProjectSprint } from 'wasp/client/operations'
import { Button, FOCUS_RING, SegmentedControl, DISABLED } from '@agenthix/ui/primitives'
import { Nudge, ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'
import { AppShell } from '../../shared/layouts/AppShell'
import { placeNavOf } from '../../places/placeNav'
import { sectionHref } from '../../places/placeSections'
import { PlaceDrillMobileHeader } from '../../places/components/PlaceDrillMobileHeader'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../shared/layouts/phoneActions'
import { refusalText } from '../../shared/refusal'
import { useDock } from '../../dock/DockContext'
import { useProjectPlace } from '../place/useProjectPlace'
import type { ProjectSprints } from '../projectSprintView'
import type { SprintPlanning } from '../sprintPlanningView'
import { PlanList, type Dragged, type ListGroup } from './PlanList'
import { BacklogHead, SprintHead } from './PlanPanelHeads'
import { dropSlotText, filterRows, groupByEpic, NO_FILTER, wholeIndex, type PlanFilter } from './planRules'
import { SPRINTS_SECTION, sprintsPath } from './sprintPaths'
import type { SprintCard } from './SprintTaskBits'
import { tasksText } from './sprintWords'
import { usePlanMoves, type Side } from './usePlanMoves'

const QUIET_LINK = `rounded text-small text-link not-disabled:hover:underline ${FOCUS_RING} ${DISABLED}`

/**
 * Plan Sprint, at `/projects/:key/sprints/:sprintId/plan` (spec N1, D14, the Sprints design's planning screen): the
 * project's Backlog and To do beside the sprint, two lists that scroll on their own. A row is dragged between them,
 * or within the sprint to order it, or moved with its ⋯; a Backlog task planned in moves to To do (N1). Each move is
 * saved as it is made, so there is nothing to save: Done planning goes back to Sprints. On a phone, one list at a time.
 */
export function PlanSprintPage() {
  const { key = '', sprintId = '' } = useParams<{ key: string; sprintId: string }>()
  const navigate = useNavigate()
  const dock = useDock()
  const { project, place } = useProjectPlace(key)
  const projectId: string | undefined = project?.id
  const mayChange = useMayWork(projectId)
  const seriesQuery = useQuery(getProjectSprints, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const sprintQuery = useQuery(getProjectSprintTasks, { sprintId })
  const planningQuery = useQuery(getSprintPlanning, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const { data: seriesData, refetch: refetchSeries } = seriesQuery
  const { data: sprintRows, refetch: refetchSprint } = sprintQuery
  const { data: planningData, refetch: refetchPlanning } = planningQuery
  // The plan is three reads; it is on screen once all three are, and one failing leaves what is there.
  const plan = useBackgroundRead({
    data: seriesData && sprintRows && planningData ? true : undefined,
    error: seriesQuery.error ?? sprintQuery.error ?? planningQuery.error ?? null,
    dataUpdatedAt: Math.min(seriesQuery.dataUpdatedAt, sprintQuery.dataUpdatedAt, planningQuery.dataUpdatedAt),
    refetch: () => Promise.all([refetchSeries(), refetchSprint(), refetchPlanning()]),
  }, { what: 'The plan' })
  const setGoal = useAction(updateProjectSprint)
  const attention = useAttention()
  const [filter, setFilter] = useState<PlanFilter>(NO_FILTER)
  const [grouped, setGrouped] = useState(false)
  const [dragged, setDragged] = useState<Dragged>(null)
  const [phoneList, setPhoneList] = useState<Side>('left')

  const series = seriesData as ProjectSprints | undefined
  const planning = planningData as SprintPlanning | undefined
  const sprint = series ? [series.current, ...series.upcoming, ...series.past].find(s => s?.id === sprintId) ?? null : undefined
  const lists = useMemo(() => ({ left: (planning?.tasks ?? []) as SprintCard[], sprint: (sprintRows ?? []) as SprintCard[] }), [planning, sprintRows])
  const reload = () => Promise.all([refetchPlanning(), refetchSprint(), refetchSeries()])
  const moves = usePlanMoves({ sprintId, projectId: projectId ?? '', lists, reload })

  const back = place ? sectionHref(place, SPRINTS_SECTION) : sprintsPath(key)
  const nav = place ? placeNavOf(place, SPRINTS_SECTION) : null
  const title = sprint ? `Plan ${sprint.title}` : 'Plan sprint'
  const agent = project?.agents.find((a: { agentId: string }) => a.agentId === project.defaultAgentId)?.agent as { id: string; name: string } | undefined
  const ask = agent && dock && project ? { label: `Ask ${agent.name} to plan this sprint`, onSelect: () => dock.startNew({ kind: 'project', key: project.key }, agent.id) } : null
  const done = () => navigate(back)
  usePhoneActions([{ label: 'Done planning', onSelect: done }, ...(ask ? [ask] : [])])

  const left = filterRows(moves.lists.left, filter)
  const leftGroups: ListGroup[] = grouped && planning
    ? groupByEpic(left, planning.epics).map(g => ({ heading: g.epic ? g.epic.title : 'In no epic', rows: g.rows }))
    : [{ heading: null, rows: left }]
  const leftShown = leftGroups.flatMap(g => g.rows)
  const sprintList = moves.lists.sprint
  const types = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of lists.left) if (t.type) seen.set(t.type.id, t.type.name)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [lists.left])

  const draggedTask = dragged ? [...moves.lists.left, ...sprintList].find(t => t.id === dragged.id) ?? null : null
  const dropInto = (to: Side, visible: SprintCard[]) => (taskId: string, index: number) =>
    moves.moveTo(taskId, to, wholeIndex(moves.lists[to], visible, taskId, index))
  const sprintSlot = (index: number) => {
    if (!draggedTask) return null
    if (dragged?.from === 'sprint') {
      const from = sprintList.findIndex(t => t.id === draggedTask.id)
      if (index === from || index === from + 1) return null
    }
    return dropSlotText(wholeIndex(sprintList, sprintList, draggedTask.id, index), draggedTask.state)
  }
  const leftSlot = (index: number) => {
    if (!draggedTask) return null
    if (dragged?.from === 'left') {
      const from = leftShown.findIndex(t => t.id === draggedTask.id)
      if (index === from || index === from + 1) return null
    }
    return dragged?.from === 'sprint' ? 'Takes it out of the sprint' : 'Drops here'
  }
  const sprintName = sprint?.title ?? 'the sprint'

  const saveGoal = (goal: string | null) => {
    setGoal({ sprintId, goal }).then(() => void refetchSeries(), err => attention.show({ title: 'The goal was not saved', text: refusalText(err), retry: () => saveGoal(goal) }))
  }

  const finished = sprint?.status === 'past'
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    ...(project ? [{ label: project.name, href: place?.homePath, list: 'projects' as const }] : []),
    { label: 'Sprints', href: back },
    { label: title },
  ]

  const leftPanel = (
    <PlanList
      side="left" label="Backlog and To do" mayChange={mayChange && !finished} dragged={dragged} onDrag={setDragged}
      header={<BacklogHead count={moves.lists.left.length} filter={filter} onFilter={setFilter} types={types} epics={planning?.epics ?? []} grouped={grouped} onGrouped={setGrouped} />}
      groups={leftGroups}
      empty={<p className="px-1 text-small text-text-muted">{moves.lists.left.length === 0 ? 'Nothing in Backlog or To do is left to plan: every task there is in a sprint.' : 'No task here matches the search and filters.'}</p>}
      slotText={leftSlot} onDrop={dropInto('left', leftShown)}
      actionsOf={t => [
        { label: `Add to ${sprintName}`, onSelect: () => moves.moveTo(t.id, 'sprint', sprintList.length) },
        { label: 'Move up', onSelect: () => moves.step(t.id, 'left', leftShown, -1), disabledWhy: leftShown[0]?.id === t.id ? 'It is first in this list' : undefined },
        { label: 'Move down', onSelect: () => moves.step(t.id, 'left', leftShown, 1), disabledWhy: leftShown.at(-1)?.id === t.id ? 'It is last in this list' : undefined },
      ]}
    />
  )
  const sprintPanel = sprint && (
    <PlanList
      side="sprint" label={sprintName} mayChange={mayChange && !finished} dragged={dragged} onDrag={setDragged}
      header={<SprintHead sprint={sprint} count={sprintList.length} isNext={series?.upcoming[0]?.id === sprint.id} mayChange={mayChange && !finished} onGoal={saveGoal} />}
      groups={[{ heading: null, rows: sprintList }]}
      empty={<p className="px-1 text-small text-text-muted">Nothing planned yet: drag tasks in from the left, or use a task's ⋯.</p>}
      foot={sprintList.length > 0 && <p className="border-t border-border-subtle py-3 text-small text-text-muted max-lg:px-1">{tasksText(sprintList.length)} · drag more in from the left, or drag one back to take it out</p>}
      slotText={sprintSlot} onDrop={dropInto('sprint', sprintList)}
      actionsOf={t => [
        { label: 'Back to Backlog and To do', onSelect: () => moves.moveTo(t.id, 'left', 0) },
        { label: 'Move up', onSelect: () => moves.step(t.id, 'sprint', sprintList, -1), disabledWhy: sprintList[0]?.id === t.id ? 'It is first in the sprint' : undefined },
        { label: 'Move down', onSelect: () => moves.step(t.id, 'sprint', sprintList, 1), disabledWhy: sprintList.at(-1)?.id === t.id ? 'It is last in the sprint' : undefined },
      ]}
    />
  )

  return (
    <AppShell breadcrumbs={breadcrumbs} placeNav={nav} mobileHeader={nav ? <PlaceDrillMobileHeader nav={nav} backHref={back} title={title} /> : undefined}>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pt-6 max-lg:px-3 max-lg:pt-3">
        <div className="flex items-start gap-3 max-lg:hidden">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-h2 font-medium text-text-primary">{title}</h1>
            <p className="text-small text-text-muted">Drag tasks between the two lists, or within {sprintName} to order them. Each move is saved as you make it.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ask && <button type="button" onClick={ask.onSelect} className={QUIET_LINK}>{ask.label} ›</button>}
            <Button variant="secondary" onClick={done}>Done planning</Button>
          </div>
        </div>
        <p className="text-small text-text-muted lg:hidden">Each move is saved as you make it.</p>
        {!plan.failedWithoutData && plan.nudge}

        {sprint === null ? (
          <Nudge place="content" title="This project has no such sprint." action={{ label: 'Back to Sprints', onClick: done }} />
        ) : plan.failedWithoutData ? (
          plan.nudge
        ) : !sprint || !planning || !sprintRows ? (
          <p className="mt-4 text-small text-text-muted">Loading the plan…</p>
        ) : (
          <>
            {finished && <p className="mt-4 text-small text-text-muted">{sprint.title} is finished: its record stays as it was, so nothing moves in or out of it.</p>}
            <SegmentedControl
              label="Which list" className="mt-3 max-w-full lg:hidden" value={phoneList} onChange={setPhoneList}
              options={[
                { value: 'left', label: `Backlog and To do · ${moves.lists.left.length}` },
                { value: 'sprint', label: `${sprint.title} · ${sprintList.length}` },
              ]}
            />
            <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-4 pb-0 max-lg:mt-3 max-lg:grid-cols-1">
              <div className={`flex min-h-0 flex-col ${phoneList === 'left' ? '' : 'max-lg:hidden'}`}>{leftPanel}</div>
              <div className={`flex min-h-0 flex-col ${phoneList === 'sprint' ? '' : 'max-lg:hidden'}`}>{sprintPanel}</div>
            </div>
          </>
        )}
      </main>
      <ShowAttention kind="alert"
        title="That move wasn't saved"
        text={moves.failed && <div className="space-y-3">
          <p>
            <b className="font-medium">{moves.failed.task.key} · {moves.failed.task.title}</b> is back in {moves.failed.back === 'left' ? 'Backlog and To do' : sprintName}, where it was. {moves.failed.why}
          </p>
          <p className="text-small text-text-muted">Your other moves are saved. Nothing else changed.</p>
        </div>}
        retry={moves.failed?.retry}
        onClose={moves.dismiss}
      />
      {attention.dialog}
    </AppShell>
  )
}
