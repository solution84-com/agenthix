import type { ReplyStepView } from '../../shared/conversations/protocol'
import { KnowledgeStepRow } from './knowledge/KnowledgeStepRow'

/**
 * How long a reply that looked things up worked: `ms` once it is written, or `since` (when it began, on this
 * screen's clock) while it still works.
 */
export type ThinkingView = { steps: ReplyStepView[] } & ({ ms: number } | { since: number })

/** A length of time as the thread says it: "26 s", "2 min 5 s". */
export function seconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

/** The toggle's words: *Thinking* while the turn works, *Thought for N s* after; nothing more. */
export function thinkingLabel(view: ThinkingView): string {
  return 'since' in view ? 'Thinking' : `Thought for ${seconds(Math.max(view.ms, 1000))}`
}

/**
 * The one quiet toggle in the agent's name line: *Thinking ›* while it works, *Thought for N s ›* after. It opens
 * the turn's steps under the name line, live while it works; folded to begin with. What it is doing now, and the
 * turn's time while it runs, are said by the line above the message box.
 */
export function ThinkingPill({ view, open, onToggle }: { view: ThinkingView; open: boolean; onToggle: () => void }) {
  const label = thinkingLabel(view)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${label}. ${open ? 'Hide' : 'Show'} the steps`}
      className="inline-flex items-center gap-1 self-center rounded-md px-1 text-micro tabular-nums text-text-muted hover:text-text-secondary max-lg:min-h-8"
      data-testid="thinking-pill"
    >
      <span>{label}</span>
      <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
    </button>
  )
}

function stepMark(step: ReplyStepView): { mark: string; tone: string; name: string } {
  if (step.failed) return { mark: '!', tone: 'text-warning font-semibold', name: "Didn't work" }
  if (step.ms === undefined && !step.made) return { mark: '…', tone: 'text-text-muted', name: 'Working' }
  return { mark: '✓', tone: 'text-success', name: 'Done' }
}

/** The turn's one list of steps, in plain words: a mark for each (done, didn't work, still working) and what it did. */
export function ThinkingSteps({ steps, placePath }: { steps: ReplyStepView[]; placePath?: string }) {
  return (
    <ol className="space-y-0.5 border-l-2 border-border pl-2.5 text-small text-text-muted" data-testid="thinking-steps">
      {steps.map((step, i) => {
        const { mark, tone, name } = stepMark(step)
        return (
          <li key={i} className="flex gap-1.5">
            <span aria-hidden className={`w-3 shrink-0 text-center ${tone}`}>{mark}</span>
            <span className="sr-only">{name}: </span>
            {step.knowledge && step.knowledge.length > 0 ? (
              <span className="min-w-0 space-y-0.5">
                {step.knowledge.map((k, n) => <span key={n} className="block"><KnowledgeStepRow data={k} placePath={placePath} /></span>)}
              </span>
            ) : (
              <span className="min-w-0 break-words">{step.label}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
