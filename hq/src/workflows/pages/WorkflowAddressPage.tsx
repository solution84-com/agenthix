import { Navigate, useParams } from 'react-router'
import { useQuery, getWorkflow, getProject } from 'wasp/client/operations'
import { workflowsAddress, type WorkflowsScreen } from './useWorkflowsUrl'
import { useBackgroundRead } from '@agenthix/ui/attention'

/**
 * A workflow's, a version's and a run's own addresses (`/workflows/<id>`, `…/versions/<n>`, `…/runs/<runId>`) open
 * the same thing inside the Workflows section of the place the workflow belongs to. The approval card in a conversation
 * links to the version's.
 */
export function WorkflowAddressPage() {
  const { workflowId, number, runId } = useParams<{ workflowId: string; number: string; runId: string }>()
  const { data: workflow, error, refetch } = useQuery(getWorkflow, workflowId ? { workflowId } : undefined, { enabled: !!workflowId })
  const projectId = workflow?.placeType === 'project' ? workflow.placeId : undefined
  const { data: project, error: projectError, refetch: refetchProject } = useQuery(getProject, projectId ? { projectId } : undefined, { enabled: !!projectId })

  const read = useBackgroundRead({
    data: workflow && (!projectId || project) ? true : undefined,
    error: error ?? projectError ?? null,
    dataUpdatedAt: Date.now(),
    refetch: () => { void refetch(); void refetchProject() },
  }, { what: 'The workflow' })
  if (read.failedWithoutData) return read.nudge
  if (!workflow || !workflowId) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>

  const screen: WorkflowsScreen = runId
    ? { view: 'run', workflowId, runId }
    : number && /^[1-9]\d*$/.test(number)
      ? { view: 'version', workflowId, number: Number(number), against: null }
      : { view: 'workflow', workflowId, tab: 'steps' }
  if (workflow.placeType === 'user') return <Navigate to={workflowsAddress('/space', screen)} replace />
  if (!project) return <p className="px-6 py-6 text-body text-text-muted">Loading…</p>
  return <Navigate to={workflowsAddress(`/projects/${project.key}`, screen)} replace />
}
