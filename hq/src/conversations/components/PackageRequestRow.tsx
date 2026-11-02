import { Link } from 'react-router'
import { PackageCheck } from 'lucide-react'
import type { OperationActivityView } from '../../shared/conversations/protocol'
import { branchGitHref } from '../toolLink'
import type { WorkBarActions } from './WorkBar'

type Card = NonNullable<OperationActivityView['packageCard']>

const BUTTON = 'rounded-lg px-3 py-1 text-small font-medium disabled:opacity-50 max-lg:min-h-10'

/**
 * An agent's ask about a package whose install script the rule blocked, in its branch's copy with no live preview open
 * (adr-0170): HQ's question, in the live preview strip's words. *Allow* lets that one version's script run, as the
 * person who pressed; *Not now* keeps it off. Buttons only for those who may work here.
 */
export function PackageRequestRow({ row, card, actions }: { row: OperationActivityView; card: Card; actions: WorkBarActions }) {
  const mayAnswer = actions.canAct && card.canAnswer
  return (
    <li className="bg-warning/5 px-3 py-2" data-testid="work-bar-package-request">
      <div className="flex items-start gap-2">
        <PackageCheck size={14} aria-hidden className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 text-small">
          <p className="break-words font-semibold text-text-primary">
            {card.agentName} asks to run {card.name} {card.version}&apos;s install script on {card.branch}
          </p>
          <p className="break-words text-text-secondary">{card.question}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {mayAnswer ? (
              <>
                <button type="button" disabled={actions.busy} onClick={() => actions.onAnswer(row.operationId, 'approve')} className={`${BUTTON} bg-accent text-on-accent hover:bg-accent-hover`}>
                  Allow
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
          <p className="mt-1 text-micro text-text-muted">Leaving it unanswered changes nothing: the agent carries on without it.</p>
        </div>
      </div>
    </li>
  )
}
