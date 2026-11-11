/**
 * Scenarios' left pane (plan task 4c.4): what will run (always the four groups, each opening its list), the run's
 * size and estimate with Run all, then the result: the four groups, collapsible, every scenario a line with a mark
 * and a word per model, failing lines tinted; a line opens its dialog. Nothing here edits a scenario.
 */
import { useState } from 'react'
import { Button } from '@agenthix/ui'
import { ShowAttention } from '@agenthix/ui/attention'
import type { PlaygroundScenario, ScenarioGroup, ScenarioLibrary } from '../../../shared/voicePlayground'
import { RowLabel } from './ModeRows'
import { cellOf, dollarsText, estimate, groupScore, lineFails, resultKey, totalScore, type RunState } from './scenarioRun'
import { FOCUS_RING_INSET } from '@agenthix/ui/primitives'

export type ScenariosPaneProps = {
  library: ScenarioLibrary | null
  problem: string | null
  run: RunState
  /** The models chosen to compare now. */
  models: readonly string[]
  labelOf: (model: string) => string
  onRun: () => void
  onSeeGroup: (group: ScenarioGroup) => void
  onOpenLine: (scenario: PlaygroundScenario) => void
}

const columns = (n: number) => ({ gridTemplateColumns: `minmax(0,1fr) repeat(${n}, 6.5rem)` })
/** Each model keeps its 6.5 rem and the line keeps 12 rem, so a narrow window scrolls the result sideways. */
const minWidth = (n: number) => ({ minWidth: `${12 + 6.5 * n + 0.375 * (n + 1)}rem` })
const tone = (pass: boolean | null) => (pass === null ? 'text-text-muted' : pass ? 'text-success' : 'text-danger')

export function ScenariosPane({ library, problem, run, models, labelOf, onRun, onSeeGroup, onOpenLine }: ScenariosPaneProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (!library) return <p className="text-small text-text-muted">{problem ?? 'Loading the scenarios…'}</p>
  const est = estimate(library, models)
  const done = Object.keys(run.results).length
  const total = run.models.length * est.scenarios
  // When a run completes, its first group with a failure opens, so the failing lines are in view.
  if (run.runId && run.endedAt !== null && openedFor !== run.runId) {
    setOpenedFor(run.runId)
    const failing = library.groups.find(g => g.scenarios.some(s => lineFails(s, run)))
    if (failing) setOpen(s => new Set(s).add(failing.id))
  }
  const toggle = (id: string) => setOpen(s => { const next = new Set(s); if (!next.delete(id)) next.add(id); return next })

  return (
    <div className="flex flex-col gap-2" data-testid="scenarios-pane">
      <RowLabel>What will run: always these four, the same every time</RowLabel>
      {library.groups.map(g => (
        <div key={g.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-small">
          <span>{g.title} <span className="text-text-muted">· {g.scenarios.length} scenarios</span></span>
          <Button variant="secondary" size="sm" aria-label={`See them: ${g.title}`} onClick={() => onSeeGroup(g)}>See them</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-small" data-testid="run-summary">
          {models.length === 0 ? 'Add a model to compare' : <>
            {est.scenarios} scenarios × {models.length} {models.length === 1 ? 'model' : 'models'} = <b>{est.calls} calls</b>
            {est.dollars !== null && <>, about {dollarsText(est.dollars)}</>}
          </>}
        </span>
        <Button size="sm" disabled={models.length === 0 || run.running} onClick={onRun}>
          {run.running ? `Running, ${done} of ${total}` : 'Run all'}
        </Button>
      </div>
      <ShowAttention kind="alert" text={problem} title="The scenarios did not run" />

      {run.runId && (
        <section aria-label="Result" className="mt-2 flex flex-col gap-1.5">
          <RowLabel>Result: all {est.scenarios}, by group <span className="normal-case tracking-normal">(open a group, then a line to see what each model did)</span></RowLabel>
          <div className="overflow-x-auto"><div className="flex flex-col gap-1.5" style={minWidth(run.models.length)}>
          <div className="grid gap-1.5 px-2 text-micro text-text-muted" style={columns(run.models.length)}>
            <span />
            {run.models.map(m => <span key={m} className="truncate text-right" title={labelOf(m)}>{labelOf(m)}</span>)}
          </div>
          {library.groups.map(g => {
            const expanded = open.has(g.id)
            return (
              <div key={g.id} className="overflow-hidden rounded-md border border-border bg-card">
                <button
                  type="button" aria-expanded={expanded} onClick={() => toggle(g.id)}
                  className={`grid w-full gap-1.5 bg-surface-2 px-2 py-1.5 text-left text-small font-medium hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET}`} style={columns(run.models.length)}
                >
                  <span><span aria-hidden>{expanded ? '▾' : '▸'}</span> {g.title}</span>
                  {run.models.map(m => {
                    const s = groupScore(g, m, run)
                    const failed = s.done - s.passed
                    return (
                      <span key={m} className={`text-right font-normal tabular-nums ${s.done === 0 ? 'text-text-muted' : 'text-text-primary'}`}>
                        {s.passed} of {s.total}{failed > 0 && <span className="block text-micro text-text-secondary">{failed} failed</span>}
                      </span>
                    )
                  })}
                </button>
                {expanded && g.scenarios.map(s => (
                  <button
                    key={s.id} type="button" data-testid="result-line" data-fails={lineFails(s, run) || undefined} onClick={() => onOpenLine(s)}
                    className={`grid w-full gap-1.5 border-t border-border-subtle py-1 pl-6 pr-2 text-left text-micro hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET} ${lineFails(s, run) ? 'bg-danger/5' : ''}`}
                    style={columns(run.models.length)}
                  >
                    <span className="truncate" title={s.last}>“{s.last}”</span>
                    {run.models.map(m => {
                      const c = cellOf(run.results[resultKey(s.id, m)], run.running)
                      return <span key={m} className={`truncate text-right ${tone(c.pass)}`}>{c.mark} {c.word}</span>
                    })}
                  </button>
                ))}
              </div>
            )
          })}
          <div className="grid gap-1.5 rounded-md border border-border bg-card px-2 py-1.5 text-small" style={columns(run.models.length)} data-testid="result-total">
            <span><b>Total</b> {est.scenarios}</span>
            {run.models.map(m => <b key={m} className="text-right tabular-nums">{totalScore(library, m, run)}</b>)}
          </div>
          </div></div>
        </section>
      )}
    </div>
  )
}
