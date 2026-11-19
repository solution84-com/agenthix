/** The barge-in group of Settings › Tuning: when a reply the person talked over waits for their words. */
import { useSyncExternalStore } from 'react'
import { BARGE_IN_LIMITS, BARGE_IN_ROWS, readBargeIn } from './bargeInNumbers'
import type { PlaygroundSettings } from './settings'

export function BargeInTuning({ settings }: { settings: PlaygroundSettings }) {
  const { bargeIn } = useSyncExternalStore(settings.subscribe, settings.get)
  return (
    <section aria-label="Talking over a reply" data-testid="barge-in-tuning">
      <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Talking over a reply</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {BARGE_IN_ROWS.map(row => {
          const { min, max } = BARGE_IN_LIMITS[row.key]
          const value = bargeIn[row.key]
          return (
            <label key={row.key} className="flex min-w-0 flex-col text-micro text-text-secondary">
              <span className="flex justify-between gap-2">
                <span className="min-w-0 leading-tight" title={row.label}>{row.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-text-primary">{value / 1000} s</span>
              </span>
              <input
                type="range" aria-label={row.label} data-testid={`barge-in-setting-${row.key}`} className="w-full accent-accent"
                min={min / 1000} max={max / 1000} step={0.1} value={value / 1000}
                onChange={e => settings.patch({ bargeIn: readBargeIn({ ...bargeIn, [row.key]: Math.round(Number(e.target.value) * 1000) }) })}
              />
            </label>
          )
        })}
      </div>
    </section>
  )
}
