import { useEffect, useState } from 'react'
import type { ReplyStepView } from '../../shared/conversations/protocol'
import { KnowledgeStepRow } from './knowledge/KnowledgeStepRow'

/**
 * How long a reply that looked things up worked: `ms` once it is written, or `since` — when it began, on this
 * screen's clock — while it still works.
 */
export type ThinkingView = { steps: ReplyStepView[] } & ({ ms: number } | { since: number })

function seconds(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

function stepTime(ms: number): string {
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : seconds(ms)
}

/** Seconds since `since`, counted on while the reply works. */
function useSecondsSince(since: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, now - since)
}

/**
 * The pill's words: *Thinking · N s* while the reply works (`elapsedMs` so far); after, *Thought for N s* and
 * what it started or set — "Thought for 6 s · started 2" — so a reply that only started work still says so.
 */
export function thinkingLabel(view: ThinkingView, elapsedMs: number): string {
  if ('since' in view) return `Thinking · ${seconds(elapsedMs)}`
  const started = view.steps.filter((s) => s.made === 'started').length
  const set = view.steps.filter((s) => s.made === 'set').length
  return [`Thought for ${seconds(Math.max(view.ms, 1000))}`, started && `started ${started}`, set && `set ${set}`].filter(Boolean).join(' · ')
}

/**
 * The greyed pill in the agent's name line (walkthrough findings 24, 34): a pulsing dot and *Thinking · N s*
 * counting up while the turn runs, *Thought for N s* and what it started or set after. Clicking it opens the
 * steps under the name line. Shown, never spoken.
 */
export function ThinkingPill({ view, open, onToggle }: { view: ThinkingView; open: boolean; onToggle: () => void }) {
  const live = 'since' in view
  const elapsed = useSecondsSince(live ? view.since : null)
  const label = thinkingLabel(view, elapsed)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${label}. ${open ? 'Hide' : 'Show'} the steps`}
      className="inline-flex items-center gap-1.5 self-center rounded-full bg-surface-2 px-2 py-px text-micro tabular-nums text-text-muted hover:text-text-secondary max-lg:min-h-8"
      data-testid="thinking-pill"
    >
      {live && <span aria-hidden data-testid="thinking-dot" className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />}
      <span>{label}</span>
      <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
    </button>
  )
}

function stepMark(step: ReplyStepView): { mark: string; tone: string } {
  if (step.failed) return { mark: '✕', tone: 'text-danger' }
  if (step.made) return { mark: '↳', tone: 'text-accent' }
  return step.ms === undefined ? { mark: '…', tone: '' } : { mark: '✓', tone: 'text-success' }
}

/** The reply's steps, one line each with its time; the one still running has none yet, nor does work it started. */
export function ThinkingSteps({ steps, placePath }: { steps: ReplyStepView[]; placePath?: string }) {
  return (
    <ol className="space-y-0.5 border-l-2 border-border pl-2.5 text-small text-text-muted" data-testid="thinking-steps">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden className={stepMark(step).tone}>{stepMark(step).mark}</span>
          {step.knowledge && step.knowledge.length > 0 ? (
            <span className="min-w-0 space-y-0.5">
              {step.knowledge.map((k, n) => <span key={n} className="block"><KnowledgeStepRow data={k} placePath={placePath} /></span>)}
            </span>
          ) : (
            <span className="min-w-0 break-words">
              {step.label}
              {step.ms !== undefined && !step.made && <span className="tabular-nums"> · {stepTime(step.ms)}</span>}
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}
