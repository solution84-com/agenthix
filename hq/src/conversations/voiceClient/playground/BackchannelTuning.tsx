/**
 * The Backchannel group of Settings › Tuning (spec §The backchannel): its switch, on by default with Adaptive voice,
 * and a slider for each of its rules; then the hum service, which picks each hum's kind and tone: its switch, how often
 * it is asked, and its model, a picker of its own (none chosen: DeepSeek Flash when offered, else hq's own choice). A
 * change applies at the next pause, or the next question.
 */
import { useSyncExternalStore } from 'react'
import { AutomationSwitch } from '@agenthix/ui'
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { HQ_LISTENER_CHOICE } from '../../../shared/voicePlaygroundLight'
import { ModelPicker } from '../../../shared/components/models/ModelPicker'
import type { DefaultRow } from '../../../shared/components/models/ModelList'
import { BACKCHANNEL_LIMITS, readBackchannel, type BackchannelSettings } from '../backchannel/settings'
import { effectiveListenerModel } from './lightModel'
import type { PlaygroundSettings } from './settings'

const HQ_ROW: DefaultRow = { value: HQ_LISTENER_CHOICE, label: "hq's choice for the hum service", under: 'the first fast model on its list the organisation reaches', setBy: '' }

type Row = { key: keyof typeof BACKCHANNEL_LIMITS; label: string; unit: 's' | 'dB'; step: number }

const ROWS: Row[] = [
  { key: 'pauseMs', label: 'Hum in a pause of at least', unit: 's', step: 0.05 },
  { key: 'latestPauseMs', label: 'and at most', unit: 's', step: 0.05 },
  { key: 'speechMs', label: 'After your speech since the agent’s last sound', unit: 's', step: 0.5 },
  { key: 'reactionSpeechMs', label: 'A reaction (sympathy, news, delight, a laugh) after', unit: 's', step: 0.25 },
  { key: 'reactionGapSpeechMs', label: 'Two reactions in a row, unless a hum came between, after', unit: 's', step: 0.5 },
  { key: 'reactionHoldMs', label: 'A reaction held over plainer answers for', unit: 's', step: 0.5 },
  { key: 'gainDb', label: 'Hums under a reply', unit: 'dB', step: 1 },
]

const SERVICE_ROW: Row = { key: 'serviceIntervalMs', label: 'Asked while you speak, every', unit: 's', step: 0.25 }

const shown = (row: Row, v: number) => (row.unit === 's' ? v / 1000 : v)
const stored = (row: Row, v: number) => (row.unit === 's' ? Math.round(v * 1000) : v)

function Slider({ row, value, onChange }: { row: Row; value: number; onChange: (v: number) => void }) {
  const { min, max } = BACKCHANNEL_LIMITS[row.key]
  return (
    <label className="flex min-w-0 flex-col text-micro text-text-secondary">
      <span className="flex justify-between gap-2">
        <span className="min-w-0 leading-tight" title={row.label}>{row.label}</span>
        <span className="shrink-0 font-medium tabular-nums text-text-primary">{shown(row, value)} {row.unit}</span>
      </span>
      <input
        type="range" aria-label={row.label} data-testid={`backchannel-setting-${row.key}`} className="w-full accent-accent"
        min={shown(row, min)} max={shown(row, max)} step={row.step} value={shown(row, value)}
        onChange={e => onChange(stored(row, Number(e.target.value)))}
      />
    </label>
  )
}

export function BackchannelTuning({ settings, choices }: { settings: PlaygroundSettings; choices?: ModelChoices }) {
  const { backchannel, humModel } = useSyncExternalStore(settings.subscribe, settings.get)
  const set = (patch: Partial<BackchannelSettings>) => settings.patch({ backchannel: readBackchannel({ ...backchannel, ...patch }) })
  const model = effectiveListenerModel(humModel, choices) ?? HQ_LISTENER_CHOICE
  return (
    <section aria-label="Backchannel" data-testid="backchannel-tuning">
      <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Backchannel</h3>
      <label className="mb-1.5 flex items-center justify-between gap-2 text-micro text-text-secondary">
        <span>Hums while you talk, by rule (no model call)</span>
        <span data-testid="backchannel-setting-on" data-on={backchannel.on}>
          <AutomationSwitch label="Hums while you talk" on={backchannel.on} onChange={on => set({ on })} />
        </span>
      </label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {ROWS.map(row => <Slider key={row.key} row={row} value={backchannel[row.key]} onChange={v => set({ [row.key]: v })} />)}
      </div>
      <div className="mt-2 flex flex-col gap-1.5" data-testid="hum-service-tuning">
        <label className="flex items-center justify-between gap-2 text-micro text-text-secondary">
          <span>Hum service: picks each sound's kind, tone and words from your words (off: only a kept calm continuer)</span>
          <span data-testid="backchannel-setting-serviceOn" data-on={backchannel.serviceOn}>
            <AutomationSwitch label="Hum service" on={backchannel.serviceOn} onChange={serviceOn => set({ serviceOn })} />
          </span>
        </label>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          <Slider row={SERVICE_ROW} value={backchannel.serviceIntervalMs} onChange={serviceIntervalMs => set({ serviceIntervalMs })} />
        </div>
        <span data-testid="hum-model-picker" data-value={model} className="text-micro text-text-secondary">
          <span className="mb-0.5 block">Hum service's model</span>
          <ModelPicker choices={choices} value={model} ariaLabel="Hum service's model" defaultRow={HQ_ROW} onChange={v => settings.patch({ humModel: v })} />
        </span>
      </div>
    </section>
  )
}
