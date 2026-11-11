import { ShieldQuestion } from 'lucide-react'
import { useQuery, getWorkflow } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'
import { inConversationWords, levelWords } from '../pages/workflowWords'
import type { ListedWorkflow, WorkflowPlace } from '../pages/workflowTypes'
import { useWorkflowNames } from './useWorkflowNames'

/** One version waiting for the place's administrators: who proposed it, the reviewer's level, the one-line change. */
export function NeedsYouRow({ place, workflow, number, onReview }: { place: WorkflowPlace; workflow: ListedWorkflow; number: number; onReview: () => void }) {
  const { data } = useQuery(getWorkflow, { workflowId: workflow.id })
  const names = useWorkflowNames(place)
  const version = data?.versions.find((v) => v.number === number)
  const origin = version?.origin === 'STARTER' ? 'Starter workflow' : version?.origin === 'IMAGE_UPGRADE' ? 'Same workflow on a newer image' : `Proposed by ${names.agent(version?.proposedByAgentId)}${inConversationWords(version?.proposedIn)}`
  const detail = [origin, version ? `Reviewer: ${levelWords(version.reviewLevel)}` : null, version?.checkSummary ?? version?.needsApprovalAgain].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2.5" data-testid="needs-you-row">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning"><ShieldQuestion size={14} aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text-primary">{workflow.name} · version {number}</p>
        <p className="break-words text-small text-text-secondary">{detail}</p>
      </div>
      <Button size="sm" onClick={onReview} aria-label={`Review ${workflow.name} version ${number}`}>Review</Button>
    </li>
  )
}
