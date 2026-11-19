/**
 * The Adaptive pacing group of Settings › Tuning (spec §When a turn ends → *Adaptive pacing*): its switch, on by default
 * with Adaptive voice, and a slider for each of its numbers and limits, and the listening style's. Off, the finish wait
 * and the hum window are the fixed values above. What it learns is never kept here: only these numbers are.
 */
import { useSyncExternalStore } from 'react'
import { AutomationSwitch } from '@agenthix/ui'
import { PACING_LIMITS, readPacing, type PacingSettings } from '../pacing/settings'
import type { PlaygroundSettings } from './settings'

type Row = { key: keyof typeof PACING_LIMITS; label: string; unit: 's' | '%' | '' | '×'; step: number }

const ROWS: Row[] = [
  { key: 'minBreaths', label: 'Learned after breaths', unit: '', step: 1 },
  { key: 'keep', label: 'Most recent breaths kept', unit: '', step: 1 },
  { key: 'finishSharePct', label: 'Finish wait: past this share of breaths', unit: '%', step: 5 },
  { key: 'finishPadMs', label: 'Finish wait: plus', unit: 's', step: 0.05 },
  { key: 'finishMinMs', label: 'Finish wait: at least', unit: 's', step: 0.1 },
  { key: 'finishMaxMs', label: 'Finish wait: at most', unit: 's', step: 0.1 },
  { key: 'humSharePct', label: 'Hums up to: this share of breaths', unit: '%', step: 5 },
  { key: 'humMinMs', label: 'Hums up to: at least', unit: 's', step: 0.1 },
  { key: 'humMaxMs', label: 'Hums up to: at most', unit: 's', step: 0.1 },
  { key: 'patientExtraMs', label: '"Let me finish": the wait adds', unit: 's', step: 0.1 },
  { key: 'fewerTimes', label: '"Fewer hums": spacing times', unit: '×', step: 1 },
]

const shown = (row: Row, v: number) => (row.unit === 's' ? v / 1000 : v)
const stored = (row: Row, v: number) => (row.unit === 's' ? Math.round(v * 1000) : v)

export function PacingTuning({ settings }: { settings: PlaygroundSettings }) {
  const { pacing } = useSyncExternalStore(settings.subscribe, settings.get)
  const set = (patch: Partial<PacingSettings>) => settings.patch({ pacing: readPacing({ ...pacing, ...patch }) })
  return (
    <section aria-label="Adaptive pacing" data-testid="pacing-tuning">
      <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Adaptive pacing</h3>
      <label className="mb-1.5 flex items-center justify-between gap-2 text-micro text-text-secondary">
        <span>Learn your pace from your breaths (off: the fixed finish wait and hum window)</span>
        <span data-testid="pacing-setting-on" data-on={pacing.on}>
          <AutomationSwitch label="Adaptive pacing" on={pacing.on} onChange={on => set({ on })} />
        </span>
      </label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {ROWS.map(row => {
          const { min, max } = PACING_LIMITS[row.key]
          const value = pacing[row.key]
          return (
            <label key={row.key} className="flex min-w-0 flex-col text-micro text-text-secondary">
              <span className="flex justify-between gap-2">
                <span className="min-w-0 leading-tight" title={row.label}>{row.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-text-primary">{shown(row, value)}{row.unit ? ` ${row.unit}` : ''}</span>
              </span>
              <input
                type="range" aria-label={row.label} data-testid={`pacing-setting-${row.key}`} className="w-full accent-accent"
                min={shown(row, min)} max={shown(row, max)} step={row.step} value={shown(row, value)}
                onChange={e => set({ [row.key]: stored(row, Number(e.target.value)) })}
              />
            </label>
          )
        })}
      </div>
    </section>
  )
}
