import { useState } from 'react'
import { Play } from 'lucide-react'
import { CARD_CLICKABLE } from '@agenthix/ui/primitives'
import { switchWorkflow, useAction } from 'wasp/client/operations'
import { RunButton } from './RunButton'
import { WorkflowSwitch } from './WorkflowSwitch'
import { stepsWords, whenWords } from '../pages/workflowWords'
import type { ListedWorkflow, WorkflowPlace } from '../pages/workflowTypes'
import { useWorkflowNames } from './useWorkflowNames'
import { ShowAttention } from '@agenthix/ui/attention'

const MARKS: Record<string, string> = { passed: '✓', failed: '✕', stopped: '■' }

/** "last run today 10:42 ✓ by Ann", from the list's answer; "never run" when it has none. */
export function lastRunWords(last: ListedWorkflow['lastRun'], by: (run: NonNullable<ListedWorkflow['lastRun']>) => string): string {
  if (!last) return 'never run'
  return `last run ${whenWords(last.endedAt ?? last.startedAt)} ${MARKS[last.state] ?? '●'} by ${by(last)}`
}

/**
 * One workflow in the Workflows section (U2): name, what it does, steps, the secrets it uses, its last run, the switch
 * (for the place's administrators; others see the state) and Run. An off row is dimmed and Run is unavailable. The row
 * opens the workflow. On a phone Run is on the workflow's page and the switch stays here.
 */
export function WorkflowRow({ place, workflow, mayAdminister, mayRun, onOpen, onRunStarted }: {
  place: WorkflowPlace
  workflow: ListedWorkflow
  mayAdminister: boolean
  mayRun: boolean
  onOpen: () => void
  onRunStarted: (runId: string) => void
}) {
  const toggle = useAction(switchWorkflow)
  const names = useWorkflowNames(place)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const definition = workflow.approved?.definition ?? null
  const secrets = definition ? [...new Set(definition.steps.flatMap((s) => s.secrets))].sort() : []
  const details = [
    definition ? stepsWords(definition.steps.length) : 'no approved version yet',
    ...(secrets.length ? [secrets.join(', ')] : []),
    ...(workflow.enabled ? [lastRunWords(workflow.lastRun, (r) => (r.agentId ? names.agent(r.agentId) : names.person(r.onBehalfOfUserId)))] : ['Off']),
  ].join(' · ')

  const flip = async () => {
    setBusy(true)
    setError(null)
    try { await toggle({ workflowId: workflow.id, enabled: !workflow.enabled }) } catch (e) { setError(e) } finally { setBusy(false) }
  }

  return (
    <li className={`rounded-xl border border-border bg-card px-3 py-2.5 ${CARD_CLICKABLE} ${workflow.enabled ? '' : 'opacity-40'}`} data-testid="workflow-row">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Open ${workflow.name}`}>
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${workflow.enabled ? 'bg-success/15 text-success' : 'bg-chip text-text-muted'}`}><Play size={14} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block truncate text-body font-medium text-text-primary">{workflow.name}</span>
            <span className="block break-words text-small text-text-secondary">{workflow.description ? `${workflow.description} · ` : ''}{details}</span>
          </span>
        </button>
        <WorkflowSwitch on={workflow.enabled} label={`${workflow.name} is ${workflow.enabled ? 'on' : 'off'}`} onToggle={mayAdminister && workflow.approved ? () => void flip() : undefined} busy={busy} />
        {mayRun && <span className="max-lg:hidden">
          <RunButton place={place} workflowId={workflow.id} name={workflow.name} definition={definition} enabled={workflow.enabled} onStarted={onRunStarted} />
        </span>}
      </div>
      <ShowAttention kind="alert" text={error} title="The workflow was not changed" onClose={() => setError(null)} />
    </li>
  )
}
