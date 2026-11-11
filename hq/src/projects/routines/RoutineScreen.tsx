import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, getRoutine } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { Pencil } from 'lucide-react'
import { VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import { usePhoneActions } from '../../shared/layouts/phoneActions'
import type { RoutineDetail } from '../../shared/routineTypes'
import { usePlaceCrumb } from '../../places/placeCrumb'
import type { PlaceRef } from '../placeAddresses'
import { useProjectAgents } from '../hooks/useProjectAgents'
import { useWorkroomClock } from '../workroom/useWorkroomLive'
import { GoingLine, RunNowButton } from './RoutineCard'
import { AgentField, ModelField, RoutineDetails, WhereFact } from './RoutineDetails'
import { RoutineName, RoutineWho } from './RoutineHeader'
import { RoutineInstructions } from './RoutineInstructions'
import { RoutineMarks } from './RoutineMarks'
import { DeleteRoutineDialog, RoutineMenu } from './RoutineMenu'
import { RoutineNeedsBar } from './RoutineNeedsBar'
import { RoutineRuns } from './RoutineRuns'
import { RoutineSwitch } from './RoutineSwitch'
import { ReadBack, ScheduleBuilder } from './ScheduleBuilder'
import { routineRunsHref, routinesHref } from './routineAddresses'
import { LINK_BUTTON } from './routineStyles'
import { nextWords, onBehalfWords, runNowWhy } from './routineWords'
import { draftOf, draftProblem, type ScheduleDraft } from './scheduleDraft'
import { useRoutineActs } from './useRoutineActs'
import { ROUTINES_REFRESH_MS, useMe, useRoutineFacts } from './useRoutineFacts'
import { ReadFailure } from '@agenthix/ui/attention'

const RUNS_PAGE = 20

/**
 * A routine's page is its edit screen (the Routines design, "A routine"): the band its card has as the page's header —
 * name (✎), agent and on whose behalf, the switch, Run now, ⋯ — then how it has been going and when it fires next, its
 * instructions, its Details with the schedule changed in place, and its runs. Every change may ask first (N6).
 */
export function RoutineScreen({ routineId, place, placeName }: { routineId: string; place: PlaceRef; placeName: string }) {
  const navigate = useNavigate()
  const me = useMe()
  const { now, todayFrom } = useWorkroomClock()
  const [runs, setRuns] = useState(RUNS_PAGE)
  const { data, error, refetch } = useQuery(getRoutine, { routineId, runs }, { refetchInterval: ROUTINES_REFRESH_MS })
  const routine = data as RoutineDetail | undefined
  const { cost } = useRoutineFacts({ routineId, runs }, todayFrom)
  const acts = useRoutineActs({ me, refetch })
  const agents = useProjectAgents(routine?.projectId, routine?.agent?.id ?? null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState<ScheduleDraft | null>(null)
  usePlaceCrumb(routine?.title ?? null)
  const why = routine && !routine.canChange ? VIEWER_CANNOT_WORK : undefined
  const runWhy = routine ? runNowWhy(routine, VIEWER_CANNOT_WORK) : 'Loading'
  usePhoneActions(routine ? [
    { label: 'Run now', onSelect: () => void acts.runNow(routine), disabledWhy: runWhy, hint: runWhy ? undefined : 'One run, on your behalf' },
    { label: 'Rename', onSelect: () => setRenaming(true), disabledWhy: why },
    { label: 'Delete…', danger: true, onSelect: () => setDeleting(true), disabledWhy: why },
  ] : null)

  if (error) return <ReadFailure what="The routine" retry={() => void refetch()} />
  if (!routine) return <p className="px-6 py-6 text-small text-text-muted max-lg:px-3">Reading the routine…</p>

  const change = (patch: Parameters<typeof acts.change>[1]) => acts.change(routine, patch)
  const next = nextWords(routine, now)
  const problem = draft ? draftProblem(draft) : null
  const draftChanged = !!draft && (draft.cron.trim() !== routine.cron || draft.timezone !== routine.timezone)
  const saveWhy = problem ? problem.text : !draftChanged ? 'Nothing has changed' : undefined
  const saveSchedule = async () => {
    if (!draft || saveWhy) return
    if (await change({ cron: draft.cron.trim(), timezone: draft.timezone })) setDraft(null)
  }
  const switchControl = <RoutineSwitch title={routine.title} on={routine.enabled} why={why} busy={acts.busyId === routine.id} onChange={on => void change({ enabled: on })} />
  const removeIt = async () => { setDeleting(false); if (await acts.remove(routine)) navigate(routinesHref(place)) }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-4 px-6 pb-6 pt-4 max-lg:px-3 max-lg:pb-3 max-lg:pt-3">
        <header className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className={renaming ? '' : 'max-lg:hidden'}>
              <RoutineName title={routine.title} editing={renaming} onEdit={() => setRenaming(true)} onDone={() => setRenaming(false)}
                onSave={title => change({ title })} readOnlyWhy={why} />
            </div>
            <RoutineWho routine={routine} me={me}><span className="lg:hidden">{switchControl}</span></RoutineWho>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-lg:hidden">
            {switchControl}
            <RunNowButton routine={routine} acts={{ onRunNow: () => void acts.runNow(routine), busy: acts.busyId === routine.id, viewerWhy: VIEWER_CANNOT_WORK }} />
            <RoutineMenu title={routine.title} items={[{ label: 'Delete…', danger: true, onSelect: () => setDeleting(true), disabledWhy: why }]} />
          </div>
        </header>

        <article aria-label="How it's going" className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 max-sm:flex-col max-sm:items-start max-sm:gap-1 max-sm:px-3">
            <RoutineMarks runs={routine.lastRuns} />
            <span className="text-small text-text-secondary"><GoingLine routine={routine} cost={cost} /></span>
            <span className="flex-1 max-sm:hidden" />
            <span className="text-small">
              <b className="font-medium text-text-primary">{routine.scheduleWords ?? routine.cron}</b>
              <span className={next.live ? 'font-medium text-text-primary' : 'text-text-muted'}> · {next.text}</span>
            </span>
          </div>
          <RoutineNeedsBar routine={routine} me={me} now={now} />
        </article>

        <div>
          <p className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted max-sm:text-small max-sm:font-normal max-sm:normal-case max-sm:tracking-normal max-sm:text-text-secondary">Instructions</p>
          <RoutineInstructions value={routine.instructions} readOnlyWhy={why} onSave={instructions => change({ instructions })} />
        </div>

        <RoutineDetails
          agent={<AgentField agentId={routine.agent?.id ?? null} agents={agents} disabledWhy={why} onChange={agentId => void change({ agentId })} />}
          model={<ModelField projectId={routine.projectId} agentId={routine.agent?.id ?? null} value={routine.modelChoice ?? ''} disabled={!!why}
            onChange={v => void change({ modelChoice: v || null })} />}
          repeats={draft ? (
            <ScheduleBuilder
              draft={draft} onChange={setDraft} now={now} was={draftChanged ? routine.scheduleWords : null}
              footer={<>
                <Button variant="secondary" onClick={() => setDraft(null)}>Cancel</Button>
                <Button disabled={!!saveWhy} title={saveWhy} onClick={() => void saveSchedule()}>Save change</Button>
              </>}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <ReadBack draft={routine} now={now} />
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-micro text-text-muted">
                  <span className="font-mono">{routine.cron}</span> · {routine.timezone}
                </span>
                <button type="button" disabled={!!why} title={why} className={LINK_BUTTON} onClick={() => setDraft(draftOf(routine.cron, routine.timezone))}>
                  <Pencil size={14} aria-hidden />Change
                </button>
              </div>
            </div>
          )}
          onBehalfOf={<span>{onBehalfWords(routine, me)} <span className="text-text-muted">· last changed it</span></span>}
          where={<WhereFact projectId={routine.projectId} name={placeName} />}
        />

        <RoutineRuns
          runs={routine.runs} total={routine.moreRuns ? `${routine.runs.length}+` : String(routine.runs.length)} more={routine.moreRuns}
          onMore={() => setRuns(n => n + RUNS_PAGE)} me={me} now={now} cost={cost} allHref={routineRunsHref(place, routine.title)}
        />
      </div>
      {deleting && <DeleteRoutineDialog title={routine.title} onCancel={() => setDeleting(false)} onDelete={() => void removeIt()} />}
      {acts.dialog}
    </div>
  )
}
