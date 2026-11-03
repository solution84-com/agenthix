import { useState } from 'react'
import { Link } from 'react-router'
import { Play } from 'lucide-react'
import { useAction, useQuery, getPlaceWorkflows, startWorkflowRun } from 'wasp/client/operations'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import type { ListedWorkflow, WorkflowPlace } from '../../workflows/pages/workflowTypes'
import { RunDialog } from '../../workflows/components/RunDialog'
import { isLivePreviewWorkflow } from '../../livePreviews/workflowNames'
import { DEPLOY_NONE, DEPLOY_PREVIEW_ONLY, VIEWER_REASON } from '../words'

type PlaceWorkflows = { workflows: ListedWorkflow[]; mayRun: boolean }

/**
 * What *Deploy…* opens (spec part 3, *Deploying*): the place's workflows that are on and approved, each run on this
 * workspace, whose folder is `main`, through the ordinary workflow runs. One that asks for parameters asks first. A
 * person who may not start runs in the place sees the list and runs nothing; with none, the line says how to add one.
 * The live preview's own workflows are left out: they run from the live preview, never on `main`.
 */
export function DeployList({ place, workspaceId }: { place: WorkflowPlace; workspaceId: string }) {
  const { data, error } = useQuery(getPlaceWorkflows, { place })
  const start = useAction(startWorkflowRun)
  const [asking, setAsking] = useState<ListedWorkflow | null>(null)
  const [started, setStarted] = useState<{ workflow: ListedWorkflow; runId: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const box = 'space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-2 text-text-secondary'

  if (error) return <p role="status" className={box}>{error.message}</p>
  const read = data as PlaceWorkflows | undefined
  if (!read) return <p className={box}>Loading…</p>
  const approved = read.workflows.filter(w => w.enabled && w.approved)
  const runnable = approved.filter(w => !isLivePreviewWorkflow(w.name))
  if (runnable.length === 0) {
    return (
      <div role="status" className={box} data-testid="deploy-none">
        <p>{DEPLOY_NONE}</p>
        {approved.length > 0 && <p className="text-micro text-text-muted">{DEPLOY_PREVIEW_ONLY}</p>}
      </div>
    )
  }

  const run = async (w: ListedWorkflow) => {
    setFailed(null)
    setStarted(null)
    if (w.approved!.definition.parameters.length > 0) { setAsking(w); return }
    try {
      const { runId } = await start({ workflowId: w.id, workspaceId, parameters: {} })
      setStarted({ workflow: w, runId })
    } catch (e) {
      setFailed(e instanceof Error ? e.message : `${w.name} did not start. Nothing was changed.`)
    }
  }

  return (
    <div className={box} data-testid="deploy-list">
      <p>Runs an approved workflow on main.</p>
      <ul className="space-y-1">
        {runnable.map(w => (
          <li key={w.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text-primary">{w.name}</p>
              {w.description && <p className="text-micro text-text-muted">{w.description}</p>}
            </div>
            <button type="button" className={FILES_BUTTON} disabled={!read.mayRun} title={read.mayRun ? undefined : VIEWER_REASON}
              aria-label={`Run ${w.name} on main`} onClick={() => void run(w)}>
              <Play size={12} aria-hidden /> Run
            </button>
          </li>
        ))}
      </ul>
      {!read.mayRun && <p className="text-micro text-text-muted">{VIEWER_REASON}</p>}
      {started && (
        <p role="status">
          {started.workflow.name} started on main.{' '}
          <Link to={`/workflows/${encodeURIComponent(started.workflow.id)}/runs/${encodeURIComponent(started.runId)}`} className="text-accent hover:underline">See the run</Link>
        </p>
      )}
      {failed && <p role="alert" className="text-danger">{failed}</p>}
      {asking && (
        <RunDialog open onClose={() => setAsking(null)} place={place} workflowId={asking.id} name={asking.name}
          definition={asking.approved!.definition} runOn={workspaceId}
          onStarted={runId => { setStarted({ workflow: asking, runId }); setAsking(null) }} />
      )}
    </div>
  )
}
