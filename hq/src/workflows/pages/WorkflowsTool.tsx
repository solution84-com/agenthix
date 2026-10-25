import { VersionReviewView } from './VersionReviewView'
import { RunView } from './RunView'
import { WorkflowView } from './WorkflowView'
import { WorkflowsListView } from './WorkflowsListView'
import { useWorkflowsUrl } from './useWorkflowsUrl'
import type { WorkflowPlace } from './workflowTypes'

/**
 * The Workflows section of a place (workflows spec part 5, U2–U5): the list, a workflow, a version's full review, or a
 * run. What is open is in the address, so a link (the approval card's among them) opens it.
 */
export function WorkflowsTool({ place }: { place: WorkflowPlace }) {
  const { screen, toList, toWorkflow, toVersion, toRun } = useWorkflowsUrl()
  switch (screen.view) {
    case 'list':
      return <WorkflowsListView place={place} onOpen={toWorkflow} onReview={toVersion} onRunStarted={toRun} />
    case 'workflow':
      return (
        <WorkflowView
          place={place}
          screen={screen}
          onBack={toList}
          onTab={(tab) => toWorkflow(screen.workflowId, tab === 'steps' ? undefined : tab)}
          onVersion={(n, against) => toVersion(screen.workflowId, n, against)}
          onRun={(runId) => toRun(screen.workflowId, runId)}
          onRunStarted={(runId) => toRun(screen.workflowId, runId)}
        />
      )
    case 'version':
      return (
        <VersionReviewView
          place={place}
          workflowId={screen.workflowId}
          number={screen.number}
          against={screen.against}
          onBack={() => toWorkflow(screen.workflowId)}
          onDecided={() => toWorkflow(screen.workflowId)}
        />
      )
    case 'run':
      return <RunView place={place} workflowId={screen.workflowId} runId={screen.runId} onBack={() => toWorkflow(screen.workflowId, 'runs')} />
  }
}
