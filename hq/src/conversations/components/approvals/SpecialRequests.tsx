/**
 * The details and answers of the requests that are answered their own way, inside the one request card: a
 * workflow version's approval (workflows spec part 5, U4), an agent's ask to merge its branch (live preview spec,
 * *Merge into main*), and an ask about a blocked package (adr-0170).
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { Button, DISABLED, FOCUS_RING, BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import type { RequestCardAnswer } from '@agenthix/ui/sessions'
import type { OperationActivityView } from '../../../shared/conversations/protocol'
import { branchGitHref, branchMergeHref } from '../../toolLink'

type WorkflowCard = NonNullable<OperationActivityView['workflowCard']>

const LEVEL_WORDS: Record<NonNullable<WorkflowCard['reviewLevel']>, string> = { low: 'Low risk', look_closely: 'Look closely', high: 'High risk' }
const BUTTON = `rounded-lg px-3 py-1.5 text-small font-medium ${FOCUS_RING} ${DISABLED} max-lg:min-h-10`
const LINK = `rounded text-small font-medium text-link hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center ${FOCUS_RING}`

/** Where a version's full review opens: the workflow's page, its version (the screen is the Workflows section's). */
export function workflowReviewHref(card: Pick<WorkflowCard, 'workflowId' | 'version'>): string {
  return `/workflows/${encodeURIComponent(card.workflowId)}/versions/${card.version}`
}

export type SpecialRequest = {
  details: ReactNode
  /** Its own buttons, in place of Approve and Deny. */
  controls?: (busy: boolean, onAnswer: (answer: 'approve' | 'decline') => void) => ReactNode
  answer?: Pick<RequestCardAnswer, 'approveLabel' | 'denyLabel' | 'askWhy'>
  waitingFor: string
  /** Shown whether or not the viewer may answer. */
  after?: ReactNode
}

function workflowRequest(card: WorkflowCard): SpecialRequest {
  const level = card.reviewLevel ? LEVEL_WORDS[card.reviewLevel] : null
  return {
    details: (
      <>
        <p className="break-words" data-testid="workflow-card-summary">{card.summary}</p>
        <p className="text-micro text-text-muted" data-testid="workflow-card-review">
          Reviewer: {level ?? card.reviewNote ?? 'still reading it'}{level && card.reviewNote ? ` · ${card.reviewNote}` : ''}
        </p>
        {card.flags.length > 0 && (
          <ul className="space-y-0.5" data-testid="workflow-card-flags">
            {card.flags.map((f, i) => (
              <li key={`${f.rule}-${i}`} className={`flex gap-1 text-micro ${f.high ? 'text-warning' : 'text-text-secondary'}`}>
                <AlertTriangle size={11} aria-hidden className="mt-0.5 shrink-0" />
                <span className="break-words">{f.high ? 'High: ' : ''}{f.message}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    ),
    // Approved only when the plain checks allow it; never declined from here.
    controls: (busy, onAnswer) => (
      <div className="flex flex-wrap items-center gap-2">
        {card.mayApprove ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => onAnswer('approve')}>Approve</Button>
        ) : (
          <span className="text-micro text-text-secondary" data-testid="workflow-card-reason">{card.reason}</span>
        )}
        <Link to={workflowReviewHref(card)} className={`${BUTTON} ${BUTTON_SECONDARY}`}>Review all of it</Link>
      </div>
    ),
    waitingFor: 'Waiting for an administrator of this place to answer',
  }
}

/** The special kind's part of a waiting request's card, or null for one answered with Approve and Deny. */
export function specialRequest(row: OperationActivityView): SpecialRequest | null {
  if (row.workflowCard) return workflowRequest(row.workflowCard)
  if (row.mergeCard) {
    const card = row.mergeCard
    return {
      details: <>
        <p className="break-words">{card.agentName} will merge {card.branch} into {card.main} as one version</p>
        {row.request?.reason && <p className="break-words text-micro">{row.request.reason}</p>}
      </>,
      answer: { approveLabel: 'Merge', denyLabel: 'Not now', askWhy: false },
      waitingFor: 'Waiting for a Member or Admin of this project to answer',
      after: <Link to={branchMergeHref(card.workspaceId, card.branch)} className={LINK}>Open in the workspace</Link>,
    }
  }
  if (row.packageCard) {
    const card = row.packageCard
    return {
      details: <>
        <p className="break-words">{card.question}</p>
        <p className="text-micro text-text-muted">Leaving it unanswered changes nothing: the agent carries on without it.</p>
      </>,
      answer: { approveLabel: 'Allow', denyLabel: 'Not now', askWhy: false },
      waitingFor: 'Waiting for a Member or Admin of this project to answer',
      after: <Link to={branchGitHref(card.workspaceId, card.branch)} className={LINK}>Open in the workspace</Link>,
    }
  }
  return null
}
