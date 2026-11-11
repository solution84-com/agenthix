import { useEffect, useState } from 'react'
import { useQuery, useAction, getWorkflowRun, stopWorkflowRun } from 'wasp/client/operations'
import { Button, PanelHeaderContent, StatePill, ViewHeaderRow } from '@agenthix/ui/primitives'
import { StepRow } from '../components/StepRow'
import { useWorkflowRunLive } from '../components/useWorkflowRunLive'
import { formatDuration, RUN_ACTIVE, RUN_WORDS } from './workflowWords'
import { useWorkflowNames } from '../components/useWorkflowNames'
import type { WorkflowPlace } from './workflowTypes'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

/** How often an active run is read again when no socket event has said it changed. */
export const RUN_BACKSTOP_MS = 5_000

const TONE = { passed: 'healthy', failed: 'danger', stopped: 'warning', running: 'neutral', waiting: 'neutral' } as const

/**
 * A run (workflows spec part 5, U5): one row per step with its time; the running step open to its live, masked output
 * and a failed run open at the failed step. Stop is for anyone who could have started it.
 */
export function RunView({ place, workflowId, runId, onBack }: { place: WorkflowPlace; workflowId: string; runId: string; onBack: () => void }) {
  const [poll, setPoll] = useState<number | false>(RUN_BACKSTOP_MS)
  const { data: run, error, refetch } = useQuery(getWorkflowRun, { runId }, { refetchInterval: poll })
  const stop = useAction(stopWorkflowRun)
  const names = useWorkflowNames(place)
  const [stopError, setStopError] = useState<unknown>(null)
  const [now, setNow] = useState(() => Date.now())
  const active = !!run && RUN_ACTIVE.has(run.state)

  useWorkflowRunLive(runId, () => { void refetch() })
  useEffect(() => { setPoll(active || !run ? RUN_BACKSTOP_MS : false) }, [active, run])
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])

  if (error) return <ReadFailure what="The run" retry={() => void refetch()} />
  if (!run) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>

  const elapsed = run.durationMs ?? (run.startedAt ? now - new Date(run.startedAt).getTime() : null)
  const by = run.agentId ? `an agent, for ${names.person(run.onBehalfOfUserId)}` : names.person(run.onBehalfOfUserId)
  const failedStep = run.state === 'failed' ? run.steps.find((s) => s.state === 'failed') : undefined

  const press = async () => {
    setStopError(null)
    try { await stop({ runId }); await refetch() } catch (e) { setStopError(e) }
  }

  return (
    <div className="max-w-3xl space-y-4 p-4">
      <ViewHeaderRow><PanelHeaderContent back={run.workflow} onBack={onBack} title="Run" /></ViewHeaderRow>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-h2 font-medium text-text-primary">{run.workflow} · run</h2>
          <p className="text-small text-text-secondary">Version {run.version} · started by {by}{elapsed !== null ? ` · ${formatDuration(elapsed)}${active ? ' so far' : ''}` : ''}</p>
        </div>
        <StatePill tone={TONE[run.state]}>{RUN_WORDS[run.state]}</StatePill>
        {active && <Button variant="danger" onClick={() => void press()} className="max-lg:w-full max-lg:justify-center">Stop</Button>}
      </div>
      <ShowAttention kind="alert" text={stopError} title="The run was not stopped" onClose={() => setStopError(null)} />
      {run.state === 'failed' && (
        <p role="alert" className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-small text-danger" data-testid="run-failure">
          {failedStep ? `${failedStep.name} failed. ` : ''}{run.failure ?? ''}
        </p>
      )}
      {run.printedSecret && (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-small text-text-primary">
          A secret was printed in this run's output and hidden. An administrator should rotate it.
        </p>
      )}
      {run.leaks.length > 0 && (
        <p role="alert" className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-small text-text-primary" data-testid="run-leaks">
          The run left a secret in {run.leaks.map((l) => `${l.path} (${l.secretName})`).join(', ')}, so its changes were dropped.
        </p>
      )}
      <ol className="space-y-2" aria-label="Steps">
        {run.steps.map((s) => <StepRow key={s.index} step={s} defaultOpen={s.state === 'running' || s.index === failedStep?.index} />)}
      </ol>
    </div>
  )
}
