import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { CheckCircle2, Loader2, Square, XCircle } from 'lucide-react'
import type { ConversationRunCard } from '../../workflows/conversationRuns'
import { formatDuration, whenWords } from '../../workflows/pages/workflowWords'

export const isRunActive = (c: Pick<ConversationRunCard, 'state'>) => c.state === 'waiting' || c.state === 'running'

/** The one line a card says: the step it is on, or how it ended. */
export function runCardLine(c: ConversationRunCard): string {
  if (c.state === 'waiting') return 'Waiting to start'
  if (c.state === 'running') return c.stepNumber ? `Step ${c.stepNumber} of ${c.stepCount}: ${c.stepName}` : 'Running'
  const took = c.durationMs !== null ? ` in ${formatDuration(c.durationMs)}` : ''
  if (c.state === 'passed') return `Passed${took}, ${whenWords(c.endedAt)}`
  if (c.state === 'stopped') return `Stopped${c.stepNumber ? ` at step ${c.stepNumber} of ${c.stepCount}` : ''}, ${whenWords(c.endedAt)}`
  return `Failed${c.failedStep ? ` at ${c.failedStep}` : ''}${took}`
}

/** A run's icon and its tone: a spinner while under way, then how it ended. */
export function runIcon(state: ConversationRunCard['state']) {
  if (isRunActive({ state })) return { Icon: Loader2, tone: 'text-text-muted motion-safe:animate-spin' }
  if (state === 'passed') return { Icon: CheckCircle2, tone: 'text-success' }
  if (state === 'stopped') return { Icon: Square, tone: 'text-text-muted' }
  return { Icon: XCircle, tone: 'text-danger' }
}

/** A workflow run this conversation started (spec part 5, U5): its step and *Follow the run*, then ✓ with the time or ✕ with the failed step and its last line. */
function RunLine({ card }: { card: ConversationRunCard }) {
  const { Icon, tone } = runIcon(card.state)
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} aria-hidden className={`mt-0.5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1 text-small">
        <p className="break-words"><span className="font-medium text-text-primary">{card.workflow}</span><span className="text-text-muted"> · </span><span data-testid="workflow-run-line" className="text-text-secondary">{runCardLine(card)}</span></p>
        {card.state === 'failed' && card.lastLine && <p className="break-words font-mono text-micro text-text-secondary" data-testid="workflow-run-last-line">{card.lastLine}</p>}
      </div>
      <Link to={card.href} className={`rounded shrink-0 text-small font-medium text-link hover:underline max-lg:min-h-10 ${FOCUS_RING}`}>{isRunActive(card) ? 'Follow the run' : 'Open the run'}</Link>
    </div>
  )
}

/** A run under way, as a row of the work bar. */
export function WorkflowRunRow({ card }: { card: ConversationRunCard }) {
  return (
    <li className="px-3 py-2" data-testid="work-bar-workflow-run" data-state={card.state}>
      <RunLine card={card} />
    </li>
  )
}

/** A finished run, as a card in the thread where it ended. */
export function WorkflowRunCard({ card }: { card: ConversationRunCard }) {
  return (
    <div className="rounded-lg border border-border-subtle px-3 py-2" data-testid="thread-workflow-run" data-state={card.state}>
      <RunLine card={card} />
    </div>
  )
}
