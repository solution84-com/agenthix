import { useState } from 'react'
import { ArrowRight, ChevronRight, CircleHelp, Loader2, Pencil, Plus, Square, Terminal, X } from 'lucide-react'
import { abridgeWorkLine, workLine, type TranscriptRow, type WorkStep, type WorkTarget } from '@agenthix/core'
import { FoldedLine } from './FoldedLine'
import { formatTime } from './SessionComponents'
import type { TranscriptEntry } from './types'

export type WorkLineActions = {
  onOpenRun?: (runId: string) => void
  /** Opens what a change changed; a target it returns false for is shown as plain text. */
  onOpenTarget?: (target: WorkTarget) => boolean | void
  canOpenTarget?: (target: WorkTarget) => boolean
}

export const toWorkEntry = (e: TranscriptEntry) => ({
  ...e,
  role: e.role as TranscriptRow['role'],
  createdAt: new Date(e.createdAt).toISOString(),
  toolName: e.toolName ?? null,
  kind: e.kind ?? null,
  thinkingDurationMs: e.thinkingDurationMs,
})

function glyph(step: WorkStep) {
  const cls = 'mt-0.5 shrink-0'
  if (step.kind === 'changed') {
    if (step.verb.startsWith('Created')) return <Plus size={12} className={`${cls} text-accent`} />
    if (step.noun === 'file') return <Pencil size={12} className={`${cls} text-accent`} />
    return <ArrowRight size={12} className={`${cls} text-accent`} />
  }
  if (step.kind === 'ran') return <Terminal size={12} className={`${cls} text-text-muted`} />
  if (step.kind === 'asked') return <CircleHelp size={12} className={`${cls} text-text-muted`} />
  if (step.kind === 'failed') return <X size={12} className={`${cls} text-danger`} />
  if (step.kind === 'stopped') return <Square size={12} className={`${cls} text-text-muted`} />
  return <span className="w-3 shrink-0" />
}

function StepRow({ step, actions, running }: { step: WorkStep; actions: WorkLineActions; running: boolean }) {
  const [open, setOpen] = useState(false)
  const target = step.target && actions.canOpenTarget?.(step.target) ? step.target : null
  const folded = step.items.length > 1
  return (
    <li className="py-0.5">
      <div className="flex items-start gap-2">
        {glyph(step)}
        <p className={`min-w-0 flex-1 text-small ${step.kind === 'changed' ? 'text-text-primary' : 'text-text-secondary'}`}>
          <span className={step.kind === 'thought' ? 'italic text-text-muted' : 'font-medium'}>{step.verb}</span>{' '}
          {step.kind === 'thought'
            ? <span className="italic text-text-muted">{step.text}</span>
            : <span className={step.kind === 'ran' ? 'font-mono text-micro break-all' : ''}>{step.text}</span>}
          {target && (
            <button type="button" onClick={() => actions.onOpenTarget?.(target)} className="ml-1.5 rounded text-accent hover:underline">
              {target.type === 'task' && target.key ? target.key : 'Open'} ›
            </button>
          )}
          {folded && (
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? 'Hide the list' : 'Show the list'} className="ml-1 inline-flex align-middle text-text-muted hover:text-text-primary">
              <ChevronRight size={12} className={open ? 'rotate-90' : ''} />
            </button>
          )}
        </p>
        {running ? <Loader2 size={12} className="mt-0.5 animate-spin text-accent" /> : <span className="shrink-0 text-micro tabular-nums text-text-muted">{formatTime(step.at)}</span>}
      </div>
      {folded && open && (
        <ul className="ml-5 mt-0.5 space-y-0.5">
          {step.items.map((item, i) => <li key={i} className="break-all text-micro text-text-muted">{item}</li>)}
        </ul>
      )}
    </li>
  )
}

/** A run's steps, every one in the order it happened; long runs show the first and last few. */
export function WorkSteps({ steps, runId, actions, running = false }: { steps: WorkStep[]; runId: string | null; actions: WorkLineActions; running?: boolean }) {
  const [all, setAll] = useState(false)
  const { head, hidden, tail } = abridgeWorkLine(steps)
  const shown = all || hidden === 0 ? steps : head
  const lastIndex = steps.length - 1
  return (
    <div>
      <ul>
        {shown.map((s, i) => <StepRow key={i} step={s} actions={actions} running={running && i === lastIndex} />)}
        {!all && hidden > 0 && (
          <li className="py-1 text-center">
            <button type="button" onClick={() => setAll(true)} className="text-micro text-accent hover:underline">··· Show all {steps.length} steps ···</button>
          </li>
        )}
        {!all && tail.map((s, i) => <StepRow key={`t${i}`} step={s} actions={actions} running={running && i === tail.length - 1} />)}
      </ul>
      {runId && actions.onOpenRun && (
        <button type="button" onClick={() => actions.onOpenRun?.(runId)} className="mt-1 text-small text-accent hover:underline">
          Open the run › <span className="text-text-muted">— every step's input and output</span>
        </button>
      )}
    </div>
  )
}

/** The work line: what the agent looked at and changed, folded to one line; opened, every step. */
export function WorkLineFold({ entries, runId, actions, span, live = false, defaultOpen = false }: {
  entries: TranscriptEntry[]
  runId: string | null
  actions: WorkLineActions
  span?: { startedAt?: string | null; endedAt?: string | null }
  live?: boolean
  defaultOpen?: boolean
}) {
  const line = workLine(entries.map(toWorkEntry), span)
  if (line.steps.length === 0 || (!line.summary && !live)) return null
  return (
    <FoldedLine label={line.summary ?? (live ? 'Working…' : '')} defaultOpen={defaultOpen || live}>
      <WorkSteps steps={line.steps} runId={live ? null : runId} actions={actions} running={live} />
    </FoldedLine>
  )
}
