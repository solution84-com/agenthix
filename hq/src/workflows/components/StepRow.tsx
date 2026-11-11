import { useState } from 'react'
import { formatDuration, STEP_MARK, STEP_WORDS } from '../pages/workflowWords'
import type { RunView } from '../pages/workflowTypes'

type Step = RunView['steps'][number]

const MARK_CLASS: Record<string, string> = {
  passed: 'bg-success/13 text-success', running: 'bg-selected text-text-primary', failed: 'bg-danger/12 text-danger',
  waiting: 'bg-chip text-text-muted', skipped: 'bg-chip text-text-muted', stopped: 'bg-warning/13 text-warning',
}

/**
 * One step of a run (U5): its state and time; the running step, and the failed step of a failed run, open to the
 * step's masked output. Any other opens on a click.
 */
export function StepRow({ step, defaultOpen }: { step: Step; defaultOpen: boolean }) {
  const [choice, setChoice] = useState<boolean | null>(null)
  const open = choice ?? defaultOpen
  const dim = step.state === 'waiting' || step.state === 'skipped'
  return (
    <li className={`rounded-xl border bg-card ${step.state === 'running' ? 'border-text-primary' : 'border-border'} ${dim ? 'opacity-40' : ''}`} data-testid="run-step" data-state={step.state}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setChoice(!open)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-label={`${step.name}, ${STEP_WORDS[step.state]}`}
      >
        <span aria-hidden className={`flex size-6 shrink-0 items-center justify-center rounded-full text-small font-medium ${MARK_CLASS[step.state] ?? MARK_CLASS.waiting}`}>{STEP_MARK[step.state]}</span>
        <span className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">{step.name}</span>
        <span className="text-small text-text-muted">{formatDuration(step.durationMs)}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {step.outputTruncated && <p className="mb-1 text-micro text-text-muted">The start of this output was dropped to keep it small.</p>}
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface-1 p-2 font-mono text-micro text-text-primary" data-testid="step-output">
            {step.output || (step.state === 'waiting' ? 'Not started yet.' : 'No output.')}
          </pre>
          {step.exitCode !== null && step.state === 'failed' && <p className="mt-1 text-small text-danger">Exited with code {step.exitCode}.</p>}
        </div>
      )}
    </li>
  )
}
