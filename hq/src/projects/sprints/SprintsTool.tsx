import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  useAction, useQuery, finishProjectSprint, getProjectByKey, getProjectSprints, getProjectSprintTasks, planNextSprint,
  setSprintLength, startSprints, updateProjectSprint,
} from 'wasp/client/operations'
import { Button, EmptyState, FOCUS_RING, DISABLED } from '@agenthix/ui/primitives'
import { useAttention } from '../../shared/components/AttentionDialog'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePhoneActions, type PhoneAction } from '../../shared/layouts/phoneActions'
import { refusalText } from '../../shared/refusal'
import type { ProjectSprints, SprintSummary } from '../projectSprintView'
import { CurrentSprintCard } from './CurrentSprintCard'
import { FinishSprintDialog, RenameSprintDialog, SprintLengthDialog, StartSprintsDialog } from './SprintDialogs'
import { PastSprintsDialog, UpcomingSprints } from './SprintLists'
import { planSprintPath } from './sprintPaths'
import type { SprintCard } from './SprintTaskBits'
import { seriesLine } from './sprintWords'
import { ReadFailure } from '@agenthix/ui/attention'

type Dialog = 'start' | 'length' | 'rename' | 'finish' | 'past' | null

const QUIET_LINK = `rounded text-link hover:underline ${FOCUS_RING}`

/**
 * A project's Sprints (spec D8, D13, N7, the Sprints design): the series' one length, the current sprint and how it is
 * going, the upcoming ones to plan, and the past ones behind one quiet link. The one filled button plans the next
 * sprint; with no sprints yet it starts them. On a phone the actions are in the top bar's ⋯.
 */
export function SprintsTool({ projectKey, workroomHref }: { projectKey?: string; workroomHref: string }) {
  const params = useParams<{ key: string }>()
  const key = projectKey ?? params.key ?? ''
  const navigate = useNavigate()
  const { data: project } = useQuery(getProjectByKey, key ? { key } : undefined, { enabled: !!key })
  const projectId: string | undefined = project?.id
  const mayChange = useMayWork(projectId)
  const { data, refetch, error } = useQuery(getProjectSprints, projectId ? { projectId } : undefined, { enabled: !!projectId })
  const series = data as ProjectSprints | undefined
  const current = series?.current ?? null
  const { data: currentTasks, refetch: refetchTasks } = useQuery(getProjectSprintTasks, current ? { sprintId: current.id } : undefined, { enabled: !!current })
  const start = useAction(startSprints)
  const planNext = useAction(planNextSprint)
  const setLength = useAction(setSprintLength)
  const update = useAction(updateProjectSprint)
  const finish = useAction(finishProjectSprint)
  const attention = useAttention()
  const [dialog, setDialog] = useState<Dialog>(null)

  const run = (title: string, work: () => Promise<unknown>, then?: (result: unknown) => void) => {
    setDialog(null)
    work().then(result => { void refetch(); void refetchTasks(); then?.(result) }, err => attention.show({ title, text: refusalText(err), retry: () => run(title, work, then) }))
  }
  const why = mayChange ? undefined : VIEWER_CANNOT_WORK
  const next: SprintSummary | undefined = series?.upcoming[0]
  const nextNumber = next?.number ?? (current ? current.number + 1 : 1)
  const planNextSprintNow = () => {
    if (!projectId) return
    if (next) navigate(planSprintPath(key, next.id))
    else run(`Sprint ${nextNumber} was not planned`, () => planNext({ projectId }), s => navigate(planSprintPath(key, (s as { id: string }).id)))
  }
  const onFinish = () => {
    if (!current) return
    const open = current.counts.total - current.counts.DONE
    if (open === 0) run(`${current.title} was not finished`, () => finish({ sprintId: current.id }))
    else setDialog('finish')
  }

  const actions: PhoneAction[] | null = !series ? null : current
    ? [
        { label: `Plan Sprint ${nextNumber}`, onSelect: planNextSprintNow, disabledWhy: why },
        { label: 'Sprint length…', onSelect: () => setDialog('length'), disabledWhy: why },
      ]
    : [{ label: 'Start sprints', onSelect: () => setDialog('start'), disabledWhy: why }]
  const onPhone = usePhoneActions(actions)

  if (error) return <ReadFailure what="The sprints" error={error} retry={() => void refetch()} />
  if (!series || !projectId) return <p className="px-6 py-6 text-small text-text-muted max-lg:px-4">Loading the sprints…</p>

  const upcomingLast = series.upcoming.at(-1) ?? current
  const lengthDays = series.lengthDays ?? 14
  const primary = current
    ? <Button disabled={!mayChange} title={why} onClick={planNextSprintNow}>Plan Sprint {nextNumber}</Button>
    : <Button disabled={!mayChange} title={why} onClick={() => setDialog('start')}>Start sprints</Button>

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex min-h-0 flex-1 flex-col px-6 py-6 max-lg:px-3 max-lg:py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-h2 font-medium text-text-primary max-lg:hidden">Sprints</h2>
            {current && (
              <p className="text-small text-text-muted">
                <span className="max-lg:hidden">{seriesLine(lengthDays, current.startDate)}</span>
                <span className="lg:hidden">{seriesLine(lengthDays, current.startDate, true)}</span>
                {' '}
                <button type="button" onClick={() => setDialog('length')} disabled={!mayChange} title={why} className={`${QUIET_LINK} max-lg:hidden`}>Sprint length…</button>
              </p>
            )}
          </div>
          <div className={`flex shrink-0 items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>{primary}</div>
        </div>

        {!current ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <EmptyState
              title="No sprints yet"
              hint="Sprints are optional: time boxes of the same length, one after another, that you plan tasks into. Start sprints asks how long each is and when the first begins."
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4 max-lg:mt-3">
            <CurrentSprintCard
              sprint={current} tasks={currentTasks as SprintCard[] | undefined} projectKey={key} mayChange={mayChange}
              workroomHref={workroomHref} onFinish={onFinish} onRename={() => setDialog('rename')}
            />
            <UpcomingSprints
              sprints={series.upcoming} projectKey={key}
              addAhead={series.mayPlanAhead && mayChange && series.upcoming.length > 0 && upcomingLast
                ? { label: `Plan Sprint ${upcomingLast.number + 1} ahead`, onAdd: () => run('The next sprint was not planned', () => planNext({ projectId })) }
                : undefined}
            />
            {series.past.length > 0 && (
              <p>
                <button type="button" onClick={() => setDialog('past')} className={`rounded text-small text-text-muted hover:underline ${FOCUS_RING} max-lg:min-h-11`}>
                  Past sprints ({series.past.length}) ›
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      {dialog === 'start' && (
        <StartSprintsDialog onCancel={() => setDialog(null)} onStart={(startDate, days) => run('The sprints were not started', () => start({ projectId, startDate, days }))} />
      )}
      {dialog === 'length' && (
        <SprintLengthDialog days={lengthDays} onCancel={() => setDialog(null)} onSave={days => run('The length was not changed', () => setLength({ projectId, days }))} />
      )}
      {dialog === 'rename' && current && (
        <RenameSprintDialog number={current.number} name={current.name} onCancel={() => setDialog(null)}
          onSave={name => run(`${current.title} was not renamed`, () => update({ sprintId: current.id, name }))} />
      )}
      {dialog === 'finish' && current && (
        <FinishSprintDialog
          title={current.title} done={current.counts.DONE} open={current.counts.total - current.counts.DONE}
          next={next ? { title: next.title, startDate: next.startDate, finishDate: next.finishDate } : { title: `Sprint ${current.number + 1}` }}
          onCancel={() => setDialog(null)}
          onFinish={unfinished => run(`${current.title} was not finished`, () => finish({ sprintId: current.id, unfinished }))}
        />
      )}
      {dialog === 'past' && <PastSprintsDialog sprints={series.past} projectKey={key} onClose={() => setDialog(null)} />}
      {attention.dialog}
    </div>
  )
}
