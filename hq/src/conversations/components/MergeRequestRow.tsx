import { Link } from 'react-router'
import { GitMerge } from 'lucide-react'
import type { OperationActivityView } from '../../shared/conversations/protocol'
import { branchGitHref } from '../toolLink'
import type { WorkBarActions } from './WorkBar'

type Card = NonNullable<OperationActivityView['mergeCard']>

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium disabled:opacity-50 max-lg:min-h-10'

/**
 * An agent's ask to merge its branch into main (live preview spec, *Merge into main*): *Merge* merges it as the
 * person who pressed, *Not now* tells the agent no. Buttons only for those who may merge here; anyone reading may
 * open the branch in the workspace view to look first.
 */
export function MergeRequestRow({ row, card, actions }: { row: OperationActivityView; card: Card; actions: WorkBarActions }) {
  const mayAnswer = actions.canAct && card.canAnswer
  return (
    <li className="bg-warning/5 px-3 py-2" data-testid="work-bar-merge-request">
      <div className="flex items-start gap-2">
        <GitMerge size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-small">
          <p className="break-words font-semibold text-text-primary">
            {card.agentName} will merge {card.branch} into {card.main} as one version
          </p>
          {row.request?.reason && <p className="break-words text-micro text-text-secondary">{row.request.reason}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {mayAnswer ? (
              <>
                <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'approve')} className={`${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`}>
                  Merge
                </button>
                <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'decline')} className={`${BUTTON} border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}>
                  Not now
                </button>
              </>
            ) : (
              <span className="text-micro text-text-muted">Waiting for a Member or Admin of this project to answer</span>
            )}
            <Link to={branchGitHref(card.workspaceId, card.branch)} className="text-small font-medium text-accent hover:underline max-lg:inline-flex max-lg:min-h-10 max-lg:items-center">
              Open in the workspace
            </Link>
          </div>
        </div>
      </div>
    </li>
  )
}
