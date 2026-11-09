/**
 * The listening family's numbers as sliders (voice that stays in the conversation, plan tasks 5.6 and 4c.1), so its
 * rhythm can be tuned while talking: a change takes effect at once, also while voice is on. Small, in two columns,
 * under the side column's Tuning heading, whose Reset is `resetListening`.
 */
import { useSyncExternalStore } from 'react'
import { DEFAULT_SETTINGS, type ListeningNumbers, type PlaygroundMode, type PlaygroundSettings } from './settings'

type Row = { key: keyof ListeningNumbers; label: string; min: number; max: number; step: number; unit: 's' | 'dB' | '' }

const ROWS: Row[] = [
  { key: 'afterSpeechMs', label: 'Speech before the first sound', min: 2, max: 20, step: 0.5, unit: 's' },
  { key: 'minGapMs', label: 'Shortest gap', min: 3, max: 30, step: 0.5, unit: 's' },
  { key: 'maxGapMs', label: 'Longest gap', min: 5, max: 45, step: 0.5, unit: 's' },
  { key: 'longestWaitMs', label: 'Longest wait, then a hum', min: 10, max: 60, step: 1, unit: 's' },
  { key: 'gainDb', label: 'Level under the reply', min: -20, max: 0, step: 1, unit: 'dB' },
  { key: 'recent', label: 'Not repeated within the last', min: 0, max: 12, step: 1, unit: '' },
  { key: 'invitationAfterStopMs', label: 'After a stop word, invite in', min: 0.5, max: 6, step: 0.25, unit: 's' },
  { key: 'invitationAfterHoldMs', label: 'After a hold, invite in', min: 1, max: 10, step: 0.5, unit: 's' },
]

/** Seconds on the slider, milliseconds in the settings. */
const shown = (row: Row, value: number) => (row.unit === 's' ? value / 1000 : value)
const stored = (row: Row, value: number) => (row.unit === 's' ? Math.round(value * 1000) : value)

export const resetListening = (settings: PlaygroundSettings) => settings.patch({ listening: DEFAULT_SETTINGS.listening })

/** In Scenarios, the first four apply; the other four shape listening sounds and the voice, which text scenarios do not use. */
const SCENARIO_ROWS = 4

export function ListeningSliders({ settings, mode = 'live' }: { settings: PlaygroundSettings; mode?: PlaygroundMode }) {
  const { listening } = useSyncExternalStore(settings.subscribe, settings.get)
  const set = (key: keyof ListeningNumbers, value: number) => settings.patch({ listening: { ...listening, [key]: value } })

  const rows = mode === 'scenarios' ? ROWS.slice(0, SCENARIO_ROWS) : ROWS
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {rows.map(row => (
        <label key={row.key} className="flex min-w-0 flex-col text-micro text-text-secondary">
          <span className="flex justify-between gap-2">
            <span className="min-w-0 leading-tight" title={row.label}>{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-text-primary">{shown(row, listening[row.key])}{row.unit && ` ${row.unit}`}</span>
          </span>
          <input
            type="range" aria-label={row.label} min={row.min} max={row.max} step={row.step} className="w-full accent-accent"
            value={shown(row, listening[row.key])}
            onChange={e => set(row.key, stored(row, Number(e.target.value)))}
          />
        </label>
      ))}
      {mode === 'scenarios' && <p className="col-span-2 text-micro text-text-muted">The other four only matter in Live.</p>}
    </div>
  )
}
