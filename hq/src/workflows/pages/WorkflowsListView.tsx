import { Fragment } from 'react'
import { useQuery, getPlaceWorkflows } from 'wasp/client/operations'
import { EmptyState } from '@agenthix/ui/primitives'
import { Workflow } from 'lucide-react'
import { NeedsYouRow } from '../components/NeedsYouRow'
import { WorkflowRow } from '../components/WorkflowRow'
import type { WorkflowPlace } from './workflowTypes'
import { ReadFailure } from '@agenthix/ui/attention'

export const WORKFLOWS_REFRESH_MS = 15_000

/**
 * The Workflows section (workflows spec part 5, U2): what waits for the place's administrators first, then every
 * workflow in the place with what it does, what it uses, whether it is on, and Run.
 */
export function WorkflowsListView({ place, onOpen, onReview, onRunStarted }: {
  place: WorkflowPlace
  onOpen: (workflowId: string) => void
  onReview: (workflowId: string, number: number) => void
  onRunStarted: (workflowId: string, runId: string) => void
}) {
  const { data, error, isLoading, refetch } = useQuery(getPlaceWorkflows, { place }, { refetchInterval: WORKFLOWS_REFRESH_MS })
  if (isLoading) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (error || !data) return <ReadFailure what="The workflows" retry={() => void refetch()} />
  const waiting = data.workflows.flatMap((w) => w.waiting.map((v) => ({ workflow: w, number: v.number })))

  return (
    <div className="max-w-3xl space-y-4 p-4">
      <p className="text-small text-text-secondary">What agents and people can run with {place.type === 'user' ? 'your' : 'this project\'s'} secrets. Each version was approved by a person.</p>
      {data.mayAdminister && waiting.length > 0 && (
        <section aria-label="Needs you" className="space-y-2">
          <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">Needs you</h2>
          <ul className="space-y-2">
            {waiting.map((w) => <NeedsYouRow key={`${w.workflow.id}-${w.number}`} place={place} workflow={w.workflow} number={w.number} onReview={() => onReview(w.workflow.id, w.number)} />)}
          </ul>
        </section>
      )}
      <section aria-label="All workflows" className="space-y-2">
        <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">All workflows</h2>
        {data.workflows.length === 0 ? (
          <EmptyState icon={Workflow} variant="inline" title="No workflows yet" hint="Ask an agent in a conversation to propose one. It is not run until a person approves it." />
        ) : (
          <ul className="space-y-2">
            {data.workflows.map((w) => (
              <Fragment key={w.id}>
                <WorkflowRow place={place} workflow={w} mayAdminister={data.mayAdminister} mayRun={data.mayRun} onOpen={() => onOpen(w.id)} onRunStarted={(runId) => onRunStarted(w.id, runId)} />
                {!data.mayAdminister && w.waiting.length > 0 && <li className="list-none px-3 text-micro text-text-muted">Waiting for an administrator: a new version of {w.name}.</li>}
              </Fragment>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
