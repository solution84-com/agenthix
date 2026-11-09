/**
 * The Scenarios mode's dialogs (plan task 4c.4): a group's scenarios, read-only; one line's result on each model, with
 * Previous and Next through every line; and exactly what one call sent, as the server kept it.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { Button, FilterTabs, Modal } from '@agenthix/ui'
import type { PlaygroundScenario, ScenarioGroup, ScenarioLibrary, SentRequest } from '../../../shared/voicePlayground'
import { didWords, resultKey, WANTED_WORDS, type RunState } from './scenarioRun'

export function GroupDialog({ group, onClose }: { group: ScenarioGroup | null; onClose: () => void }) {
  return (
    <Modal open={group !== null} onClose={onClose} title={group?.title} closeLabel="Close">
      {group && (
        <div className="space-y-3">
          <p className="text-small text-text-secondary">{group.scenarios.length} scenarios. They are fixed: the same every run.</p>
          <ol className="m-0 mb-3 max-h-80 list-none space-y-1 overflow-y-auto rounded-md border border-border-subtle p-2 text-small" data-testid="group-scenarios">
            {group.scenarios.map((s, i) => <li key={s.id} className="line-clamp-2">{i + 1} · “{s.last}”</li>)}
          </ol>
          <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
        </div>
      )}
    </Modal>
  )
}

const secs = (ms: number | null) => (ms === null ? 'nothing came' : `+${(ms / 1000).toFixed(1)} s`)

export type LineDialogProps = {
  library: ScenarioLibrary
  run: RunState
  scenario: PlaygroundScenario | null
  labelOf: (model: string) => string
  onMove: (scenario: PlaygroundScenario) => void
  onClose: () => void
  sent: (scenarioId: string, model: string) => Promise<SentRequest>
}

export function LineDialog({ library, run, scenario, labelOf, onMove, onClose, sent }: LineDialogProps) {
  const [showSent, setShowSent] = useState(false)
  const all = library.groups.flatMap(g => g.scenarios)
  const at = scenario ? all.findIndex(s => s.id === scenario.id) : -1
  const group = scenario ? library.groups.find(g => g.id === scenario.wanted) : undefined
  const rows: { name: string; cell: (model: string) => ReactNode }[] = [
    { name: 'Result', cell: m => { const r = run.results[resultKey(scenario!.id, m)]; return !r ? 'not run yet' : <span className={r.pass ? 'font-semibold text-success' : 'font-semibold text-danger'}>{r.pass ? '✓ pass' : '✗ fail'}</span> } },
    { name: 'What it did', cell: m => { const r = run.results[resultKey(scenario!.id, m)]; return !r ? '' : r.error ? `Failed: ${r.error}` : `${didWords(r.did)}${r.calls.length ? ` (${r.calls.join(', ')})` : ''}${r.wroteFirst ? '; wrote words first' : ''}` } },
    { name: 'What it said', cell: m => { const r = run.results[resultKey(scenario!.id, m)]; return !r ? '' : r.text ? `“${r.text}”` : '(nothing)' } },
    { name: 'Its reason', cell: m => { const r = run.results[resultKey(scenario!.id, m)]; return !r ? '' : r.reason ? `“${r.reason}”` : '(none)' } },
    { name: 'Time', cell: m => { const r = run.results[resultKey(scenario!.id, m)]; return !r ? '' : `${secs(r.firstOutputMs)} · ${r.inputTokens.toLocaleString()} in · ${r.outputTokens.toLocaleString()} out` } },
  ]
  return (
    <>
      <Modal open={scenario !== null && !showSent} onClose={onClose} title={scenario ? `“${scenario.last}”` : undefined} closeLabel="Close" maxWidth="max-w-3xl">
        {scenario && group && (
          <div className="space-y-3">
            <p className="text-small text-text-secondary">In: {group.title} · we want: <b>{WANTED_WORDS[scenario.wanted]}</b></p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-small" data-testid="line-detail">
                <thead>
                  <tr><th className="border border-border-subtle bg-surface-2 p-1.5" />{run.models.map(m => <th key={m} className="border border-border-subtle bg-surface-2 p-1.5 text-left">{labelOf(m)}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.name}>
                      <th scope="row" className="border border-border-subtle p-1.5 text-left align-top">{r.name}</th>
                      {run.models.map(m => <td key={m} className="border border-border-subtle p-1.5 align-top">{r.cell(m)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={at <= 0} onClick={() => onMove(all[at - 1]!)}><span aria-hidden>◀</span> Previous</Button>
              <Button variant="secondary" size="sm" disabled={at < 0 || at >= all.length - 1} onClick={() => onMove(all[at + 1]!)}>Next <span aria-hidden>▶</span></Button>
              <Button variant="secondary" size="sm" onClick={() => setShowSent(true)}>Show exactly what was sent</Button>
            </div>
          </div>
        )}
      </Modal>
      {scenario && showSent && (
        <SentDialog scenario={scenario} models={run.models} labelOf={labelOf} sent={sent} onClose={() => setShowSent(false)} />
      )}
    </>
  )
}

const Block = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-1">
    <h3 className="text-micro font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-surface-2 p-2 font-mono text-micro text-text-primary">{children}</pre>
  </section>
)

const json = (v: unknown) => JSON.stringify(v, null, 2)

function SentDialog({ scenario, models, labelOf, sent, onClose }: {
  scenario: PlaygroundScenario; models: readonly string[]; labelOf: (m: string) => string
  sent: LineDialogProps['sent']; onClose: () => void
}) {
  const [model, setModel] = useState(models[0] ?? '')
  const [answer, setAnswer] = useState<{ model: string; sent?: SentRequest; error?: string } | null>(null)
  useEffect(() => {
    let live = true
    sent(scenario.id, model)
      .then(s => { if (live) setAnswer({ model, sent: s }) })
      .catch((err: unknown) => { if (live) setAnswer({ model, error: err instanceof Error ? err.message : String(err) }) })
    return () => { live = false }
  }, [scenario.id, model, sent])
  const shown = answer?.model === model ? answer : null
  const messages = shown?.sent?.messages ?? []
  return (
    <Modal open onClose={onClose} title="Exactly what was sent" closeLabel="Close" maxWidth="max-w-4xl">
      <div className="max-h-[70vh] space-y-3 overflow-y-auto">
        <p className="text-small text-text-muted">As hq hands it to the model, without the key.</p>
        {models.length > 1 && <FilterTabs label="Which model's call" tabs={models.map(m => ({ value: m, label: labelOf(m) }))} value={model} onChange={setModel} />}
        {!shown && <p className="text-small text-text-muted">Loading…</p>}
        {shown?.error && <p role="alert" className="text-small text-danger">{shown.error}</p>}
        {shown?.sent && (
          <>
            <Block title="The instructions">{shown.sent.instructions.join('\n\n')}</Block>
            <Block title="The conversation">{json(messages.slice(0, -1))}</Block>
            <Block title="The last message">{json(messages.at(-1))}</Block>
            <Block title="The tools">{json(shown.sent.tools)}</Block>
            <Block title="The settings">{json(shown.sent.settings)}</Block>
          </>
        )}
        <div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  )
}
