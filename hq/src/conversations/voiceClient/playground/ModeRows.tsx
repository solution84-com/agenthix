/**
 * The row under each mode (plan task 4c.1). Live: *Talk to* with one model in the standard model picker (the fake
 * model, which answers after a delay set here, as its first row), the Adaptive voice switch, and Start over.
 * Scenarios: *Compare* with the models to run, the same switch, and Clear results.
 */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { AutomationSwitch, Button, Input, Modal } from '@agenthix/ui'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { ModelPicker, OFFERED_HERE } from '../../../shared/components/models/ModelPicker'
import { fromChoices } from '../../../shared/components/models/modelListLogic'
import type { DefaultRow } from '../../../shared/components/models/ModelList'
import { FAKE_MAX_DELAY_MS, SCENARIO_MAX_MODELS } from '../../../shared/voicePlayground'
import { AddAModel } from './AddAModel'
import type { PlaygroundSettings } from './settings'

/** How many working models Scenarios opens with, before the person has chosen. */
const STARTING_MODELS = 2

/** The picker's value for the fake model, which no real model has (theirs are `<providerId>/<model>`). */
export const FAKE_MODEL = 'fake-model'
const FAKE_ROW: DefaultRow = { value: FAKE_MODEL, label: 'Fake model (test waiting)', under: 'answers after the seconds set beside it', setBy: '' }
const DEFAULT_DELAY_MS = 1_500

export const RowLabel = ({ children }: { children: ReactNode }) => (
  <span className="text-micro font-medium uppercase tracking-wide text-text-muted">{children}</span>
)

export function AdaptiveVoiceSwitch({ settings }: { settings: PlaygroundSettings }) {
  const { adaptiveVoice } = useSyncExternalStore(settings.subscribe, settings.get)
  const [open, setOpen] = useState(false)
  return (
    <span className="inline-flex items-center gap-2">
      <RowLabel>Adaptive voice</RowLabel>
      <AutomationSwitch label="Adaptive voice" on={adaptiveVoice} onChange={on => settings.patch({ adaptiveVoice: on })} />
      <span className="w-6 text-small font-medium text-text-primary">{adaptiveVoice ? 'On' : 'Off'}</span>
      <button
        type="button" aria-label="About Adaptive voice" onClick={() => setOpen(true)}
        className={`group inline-flex size-6 items-center justify-center rounded-full ${FOCUS_RING} max-lg:size-8`}
      >
        <span aria-hidden className="inline-flex size-4 items-center justify-center rounded-full border border-border text-micro font-medium italic text-text-muted group-hover:border-border-strong group-hover:text-text-primary max-lg:size-5">i</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Adaptive voice" closeLabel="Close">
        <div className="space-y-3 text-body text-text-primary">
          <p><b>On:</b> the agent may open a slow reply with one short sentence, makes listening sounds while you talk at length, and plays one stored phrase when it is slow.</p>
          <p><b>Off:</b> none of those. It only answers, and keeps listening when you trail off.</p>
          <p className="text-text-secondary">It changes what the model is told, so it matters in Scenarios too.</p>
          <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Close</Button></div>
        </div>
      </Modal>
    </span>
  )
}

const ROW = 'flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-2 lg:px-6'

export function LiveRow({ settings, choices, onStartOver }: { settings: PlaygroundSettings; choices: ModelChoices | undefined; onStartOver: () => void }) {
  const { lead } = useSyncExternalStore(settings.subscribe, settings.get)
  const delaySecs = lead.kind === 'fake' ? lead.delayMs / 1000 : DEFAULT_DELAY_MS / 1000
  const value = lead.kind === 'fake' ? FAKE_MODEL : lead.model
  return (
    <div className={ROW} data-testid="live-row">
      <RowLabel>Talk to</RowLabel>
      <ModelPicker
        choices={choices} value={value} ariaLabel="Talk to" defaultRow={FAKE_ROW}
        onChange={v => settings.patch({ lead: v === FAKE_MODEL ? { kind: 'fake', delayMs: delaySecs * 1000 } : { kind: 'model', model: v } })}
      />
      {lead.kind === 'fake' && (
        <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-small text-text-secondary">
          answers after
          <Input
            aria-label="Seconds before the fake model answers" className="shrink-0 px-1! text-center" style={{ width: '2.75rem' }} type="number" min={0} max={FAKE_MAX_DELAY_MS / 1000} step={0.5}
            value={delaySecs} onChange={e => settings.patch({ lead: { kind: 'fake', delayMs: Math.max(0, Number(e.target.value) || 0) * 1000 } })}
          />
          seconds
        </label>
      )}
      <AdaptiveVoiceSwitch settings={settings} />
      <span className="flex-1" />
      <Button variant="secondary" size="sm" onClick={onStartOver}>Start over</Button>
    </div>
  )
}

export function ScenariosRow({ settings, choices, running, hasRun, onClear }: {
  settings: PlaygroundSettings; choices: ModelChoices | undefined
  /** A run is going: the models cannot change under it. */
  running: boolean
  /** There is a run shown, whole or part, to clear. */
  hasRun: boolean
  onClear: () => void
}) {
  const { compare, compareChosen } = useSyncExternalStore(settings.subscribe, settings.get)
  const working = (choices?.models ?? []).filter(m => !m.notWorking)
  const models = fromChoices(working)
  // Until the person chooses, the first working models; a later choice, even to none, is theirs.
  useEffect(() => {
    if (compareChosen || compare.length > 0 || working.length === 0) return
    settings.patch({ compare: working.slice(0, STARTING_MODELS).map(m => m.value) })
  }, [compareChosen, compare.length, working, settings])
  const choose = (next: string[]) => settings.patch({ compare: next, compareChosen: true })
  const full = compare.length >= SCENARIO_MAX_MODELS
  const labelOf = (v: string) => choices?.models.find(m => m.value === v)?.label ?? v
  return (
    <div className={ROW} data-testid="scenarios-row">
      <RowLabel>Compare</RowLabel>
      {compare.map(v => (
        <button
          key={v} type="button" aria-label={`Stop comparing ${labelOf(v)}`} title="Stop comparing it" disabled={running}
          onClick={() => choose(compare.filter(c => c !== v))}
          className={`inline-flex disabled:cursor-not-allowed disabled:opacity-40 items-center gap-1 rounded-full border border-border bg-chip px-2.5 py-1 text-small text-text-primary not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed ${FOCUS_RING} max-lg:min-h-10`}
        >
          {labelOf(v)} <span aria-hidden className="text-success">✓</span>
        </button>
      ))}
      <AddAModel
        models={models} offered={OFFERED_HERE} disabled={!choices || full || running} title={full ? `Up to ${SCENARIO_MAX_MODELS} models` : undefined}
        added={m => compare.includes(m.id)}
        onAdd={({ models: chosen }) => choose([...compare, ...chosen.filter(m => !compare.includes(m))].slice(0, SCENARIO_MAX_MODELS))}
      />
      {full && <span className="text-micro text-text-muted">Up to {SCENARIO_MAX_MODELS} models</span>}
      <AdaptiveVoiceSwitch settings={settings} />
      <span className="flex-1" />
      <Button variant="secondary" size="sm" disabled={!hasRun} title="Stops a run that is going, and clears its results" onClick={onClear}>Clear results</Button>
    </div>
  )
}
