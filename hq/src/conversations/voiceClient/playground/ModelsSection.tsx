/**
 * The Settings tab's Models section (plan task 4c.1): *Talk to · answers you* with one model in the standard model
 * picker (the fake model, which answers after a delay set here, as its first row), the Adaptive voice switch (on:
 * the light model listens; off: plain voice), and under it, while it is on, *Light model · listens while you speak*. A pick the page no longer offers says so in one line
 * under its picker (`staleModels.ts`).
 */
import { useState, useSyncExternalStore } from 'react'
import { AutomationSwitch, Button, Input, Modal } from '@agenthix/ui'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { ModelPicker } from '../../../shared/components/models/ModelPicker'
import type { DefaultRow } from '../../../shared/components/models/ModelList'
import { FAKE_MAX_DELAY_MS } from '../../../shared/voicePlayground'
import { RowLabel, StaleNote } from './fields'
import { LightModelControls } from './LightControls'
import type { StaleNotes } from './staleModels'
import type { PlaygroundSettings } from './settings'

/** The picker's value for the fake model, which no real model has (theirs are `<providerId>/<model>`). */
export const FAKE_MODEL = 'fake-model'
const FAKE_ROW: DefaultRow = { value: FAKE_MODEL, label: 'Fake model (test waiting)', under: 'answers after the seconds set beside it', setBy: '' }
const DEFAULT_DELAY_MS = 1_500

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
          <p><b>On:</b> a small, fast model listens while you talk. It makes a short sound when you pause to think, says "mm-hm" or invites you to go on when you talk at length, and decides when you have finished, so the agent answers when you are done and not on a fixed silence. When you ask something that needs work, it says a short line so you are not left waiting, then the agent answers.</p>
          <p><b>Off:</b> plain voice. Nothing is said until the reply, the sound model's own end detection ends your turn, and the agent answers every message.</p>
          <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Close</Button></div>
        </div>
      </Modal>
    </span>
  )
}

const FIELD = 'flex flex-col gap-1.5 px-3 py-2'

export function ModelsSection({ settings, choices, stale, onPicked }: {
  settings: PlaygroundSettings; choices: ModelChoices | undefined; stale: StaleNotes
  /** The person chose a model themselves: its note no longer applies. */
  onPicked: (which: keyof StaleNotes) => void
}) {
  const { lead } = useSyncExternalStore(settings.subscribe, settings.get)
  const delaySecs = lead.kind === 'fake' ? lead.delayMs / 1000 : DEFAULT_DELAY_MS / 1000
  const value = lead.kind === 'fake' ? FAKE_MODEL : lead.model
  return (
    <div data-testid="models-section" className="flex flex-col divide-y divide-border-subtle">
      <div className={FIELD}>
        <RowLabel>Talk to · answers you</RowLabel>
        <div className="flex flex-wrap items-center gap-3">
          <ModelPicker
            choices={choices} value={value} ariaLabel="Talk to" defaultRow={FAKE_ROW}
            onChange={v => { onPicked('lead'); settings.patch({ lead: v === FAKE_MODEL ? { kind: 'fake', delayMs: delaySecs * 1000 } : { kind: 'model', model: v } }) }}
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
        </div>
        <StaleNote id="lead-stale-note" text={stale.lead} />
      </div>
      <div className={FIELD}><AdaptiveVoiceSwitch settings={settings} /></div>
      <LightModelControls settings={settings} choices={choices} staleNote={stale.light} onPicked={() => onPicked('light')} />
    </div>
  )
}
