import { useState } from 'react'
import { useQuery, useAction, getProjectRoutines, getRoutine, createRoutine, updateRoutine, runRoutineNow } from 'wasp/client/operations'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { Button, PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import type { RoutineDetail, RoutineRunView, RoutineSummary } from '../../shared/routineTypes'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { NewRoutineForm } from './NewRoutineForm'

/*
 * A minimal list and page for routines as repeatable runs (adr-0177), kept working until the Routines screens
 * replace them: each routine's switch, schedule, who it runs for, next time and Run now; one routine's
 * instructions and runs.
 */

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

const RUN_WORDS: Record<RoutineRunView['state'], string> = {
  STARTING: 'Starting', RUNNING: 'Running', FINISHED: 'Finished', FAILED: 'Failed', STOPPED: 'Stopped', SKIPPED: 'Skipped',
}

function runLine(r: RoutineRunView): string {
  const state = r.ask ? 'Needs you' : RUN_WORDS[r.state]
  const by = r.startedBy ? ` · started by ${r.startedBy.username ?? 'a person'} (Run now)` : ''
  return `${r.number ? `Run ${r.number}` : 'Skipped'} · ${when(r.dueAt ?? r.startedAt)} · ${state}${r.reason ? `: ${r.reason}` : ''}${by}`
}

const isGoing = (r: RoutineSummary) => r.lastRuns.some(run => run.state === 'STARTING' || run.state === 'RUNNING')

function useRoutineActs() {
  const updateFn = useAction(updateRoutine)
  const runNowFn = useAction(runRoutineNow)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const act = async (routineId: string, fn: () => Promise<unknown>) => {
    setBusyId(routineId)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work. Nothing was changed.')
    } finally {
      setBusyId(null)
    }
  }
  return {
    busyId, error,
    toggle: (id: string, enabled: boolean) => act(id, () => updateFn({ routineId: id, enabled })),
    runNow: (id: string) => act(id, () => runNowFn({ routineId: id })),
  }
}

function RoutineBand({ r, acts }: { r: RoutineSummary; acts: ReturnType<typeof useRoutineActs> }) {
  const going = isGoing(r)
  const runNowWhy = !r.canChange ? 'You may not run it: you do not work in this project'
    : !r.enabled ? 'It is off: switch it on to run it'
    : going ? 'Its last run is still going' : undefined
  return (
    <div className="flex items-center gap-2">
      <AutomationSwitch label={`${r.title} on`} on={r.enabled} disabled={!r.canChange || acts.busyId === r.id} onChange={on => void acts.toggle(r.id, on)} />
      <Button variant="secondary" size="sm" title={runNowWhy} disabled={!!runNowWhy || acts.busyId === r.id} onClick={() => void acts.runNow(r.id)}>Run now</Button>
    </div>
  )
}

function routineLine(r: RoutineSummary): string {
  const status = r.enabled ? `next ${when(r.nextDueAt)}` : r.pausedReason ? `off: ${r.pausedReason}` : 'off'
  return `${r.agent?.name ?? 'No agent'} · on behalf of ${r.onBehalfOf.username ?? 'someone'} · ${r.scheduleWords ?? r.cron} · ${status}`
}

/** One routine at its own address inside the tool. */
export function OneRoutine({ routineId, onBack }: { routineId: string; onBack: () => void }) {
  const [runs, setRuns] = useState(20)
  const { data, error } = useQuery(getRoutine, { routineId, runs })
  const acts = useRoutineActs()
  const routine = data as RoutineDetail | undefined
  return (
    <div>
      <ViewHeaderRow><PanelHeaderContent back="Routines" onBack={onBack} title={routine?.title} /></ViewHeaderRow>
      {!routine ? (
        <p className="px-4 py-3 text-small text-text-muted">{error ? (error as Error).message : 'Loading…'}</p>
      ) : (
        <div className="space-y-4 px-4 py-3">
          <RoutineBand r={routine} acts={acts} />
          {acts.error && <p role="alert" className="text-small text-danger">{acts.error}</p>}
          <p className="text-small text-text-secondary">{routineLine(routine)}</p>
          <p className="text-small text-text-muted">Next: {routine.nextTimes.map(t => when(t)).join(' · ') || '—'}</p>
          <pre className="whitespace-pre-wrap text-body text-text-primary">{routine.instructions || 'No instructions yet.'}</pre>
          <ul className="divide-y divide-border-subtle">
            {routine.runs.length === 0 && <li className="py-2 text-small text-text-muted">No runs yet.</li>}
            {routine.runs.map(r => <li key={r.id} className="py-2 text-small text-text-secondary">{runLine(r)}</li>)}
          </ul>
          {routine.moreRuns && <Button variant="secondary" onClick={() => setRuns(n => n + 20)}>Older runs</Button>}
        </div>
      )}
    </div>
  )
}

/** New routine: made on the viewer's behalf, on, its first run at the schedule's next time. */
export function NewRoutine({ projectId, onCancel, onCreated, back = 'Routines' }: {
  projectId: string
  onCancel: () => void
  onCreated: (id: string) => void
  back?: string
}) {
  const createFn = useAction(createRoutine)
  return (
    <div>
      <ViewHeaderRow><PanelHeaderContent back={back} onBack={onCancel} title="New routine" /></ViewHeaderRow>
      <div className="px-4 py-3">
        <NewRoutineForm
          submitLabel="Create routine"
          onCancel={onCancel}
          onSubmit={async value => {
            const { id } = await createFn({ projectId, ...value })
            onCreated(id)
          }}
        />
      </div>
    </div>
  )
}

/** The Automation tool's Routines view: the list, each with its switch and Run now. */
export function AutomationRoutinesView({ projectId, onOpen, onNew, onBack }: {
  projectId: string
  onOpen: (routineId: string) => void
  onNew: () => void
  onBack: () => void
}) {
  const mayWork = useMayWork(projectId)
  const { data } = useQuery(getProjectRoutines, { projectId })
  const acts = useRoutineActs()
  const routines = data as RoutineSummary[] | undefined
  return (
    <div className="space-y-4 p-4">
      <ViewHeaderRow><PanelHeaderContent back="Automation" onBack={onBack} title="Routines" /></ViewHeaderRow>
      {mayWork && <div className="flex justify-end"><Button variant="primary" onClick={onNew}>New routine</Button></div>}
      {acts.error && <p role="alert" className="text-small text-danger">{acts.error}</p>}
      {!routines ? (
        <p className="text-small text-text-muted">Loading…</p>
      ) : routines.length === 0 ? (
        <p className="text-small text-text-muted">
          No routines yet. A routine has an agent do the same thing on a schedule, for example “every weekday at 9:00, check the site's links and report what is broken”.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {routines.map(r => (
            <li key={r.id} className="flex items-start gap-3 py-2.5">
              <button type="button" onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-body font-medium text-text-primary hover:underline">{r.title}</div>
                <div className="truncate text-small text-text-muted">{routineLine(r)}</div>
              </button>
              <RoutineBand r={r} acts={acts} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
