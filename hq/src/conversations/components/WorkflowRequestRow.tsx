import { Link } from 'react-router'
import { AlertTriangle, ShieldQuestion } from 'lucide-react'
import type { OperationActivityView } from '../../shared/conversations/protocol'
import type { WorkBarActions } from './WorkBar'

type Card = NonNullable<OperationActivityView['workflowCard']>

const LEVEL_WORDS: Record<NonNullable<Card['reviewLevel']>, string> = { low: 'Low risk', look_closely: 'Look closely', high: 'High risk' }

/** Where a version's full review opens: the workflow's page, its version (the screen is the Workflows section's). */
export function workflowReviewHref(card: Pick<Card, 'workflowId' | 'version'>): string {
  return `/workflows/${encodeURIComponent(card.workflowId)}/versions/${card.version}`
}

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium disabled:opacity-50 max-lg:min-h-10'

/**
 * A workflow version's approval card (workflows spec part 5, U4): the plain checks' one line, the reviewer's level,
 * every flag; Approve only when the plain checks allow it, otherwise only Review all of it with the reason. Buttons
 * only for the place's administrators.
 */
export function WorkflowRequestRow({ row, card, actions }: { row: OperationActivityView; card: Card; actions: WorkBarActions }) {
  const level = card.reviewLevel ? LEVEL_WORDS[card.reviewLevel] : null
  const mayAnswer = actions.canAct && card.canAnswer
  return (
    <li className="bg-warning/5 px-3 py-2" data-testid="work-bar-workflow-request">
      <div className="flex items-start gap-2">
        <ShieldQuestion size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-small">
          <p className="break-words font-semibold text-text-primary">{row.title}</p>
          <p className="break-words text-micro text-text-secondary" data-testid="workflow-card-summary">{card.summary}</p>
          <p className="text-micro text-text-muted" data-testid="workflow-card-review">
            Reviewer: {level ?? card.reviewNote ?? 'still reading it'}
            {level && card.reviewNote ? ` · ${card.reviewNote}` : ''}
          </p>
          {card.flags.length > 0 && (
            <ul className="mt-1 space-y-0.5" data-testid="workflow-card-flags">
              {card.flags.map((f, i) => (
                <li key={`${f.rule}-${i}`} className={`flex gap-1 text-micro ${f.high ? 'text-warning' : 'text-text-secondary'}`}>
                  <AlertTriangle size={11} aria-hidden className="mt-0.5 shrink-0" />
                  <span className="break-words">{f.high ? 'High: ' : ''}{f.message}</span>
                </li>
              ))}
            </ul>
          )}
          {!mayAnswer ? (
            <p className="mt-1 text-micro text-text-muted">Waiting for an administrator of this place to answer</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {card.mayApprove ? (
                <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'approve')} className={`${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`}>
                  Approve
                </button>
              ) : (
                <span className="text-micro text-text-secondary" data-testid="workflow-card-reason">{card.reason}</span>
              )}
              <Link to={workflowReviewHref(card)} className={`${BUTTON} border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}>
                Review all of it
              </Link>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
