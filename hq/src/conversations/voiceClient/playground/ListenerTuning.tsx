/**
 * Every cap and first value of the light model as sliders, grouped (plan task 5.2), in place of the listening family's
 * sliders while the light model is on: hq's (`LISTENER_SETTINGS`, each within its limits) and the browser's timing. A
 * change applies to the next call and the next check. Reset is `resetListener`.
 */
import { useSyncExternalStore } from 'react'
import { AutomationSwitch } from '@agenthix/ui'
import { DEFAULT_SETTINGS, type PlaygroundSettings } from './settings'
import { TUNING_GROUPS, inMs, limitsOf, listenerWith, valueAt, type TuningRow } from './lightTuning'
import { BackchannelTuning } from './BackchannelTuning'
import { PacingTuning } from './PacingTuning'
import { BargeInTuning } from './BargeInTuning'
import { ToneTuning } from './ToneTuning'
import type { ModelChoices } from '../../../shared/conversations/protocol'

export const resetListener = (settings: PlaygroundSettings) =>
  settings.patch({
    listener: DEFAULT_SETTINGS.listener, ownTiming: DEFAULT_SETTINGS.ownTiming, backchannel: DEFAULT_SETTINGS.backchannel, pacing: DEFAULT_SETTINGS.pacing,
    tone: DEFAULT_SETTINGS.tone, bargeIn: DEFAULT_SETTINGS.bargeIn,
  })

const shown = (row: TuningRow, v: number) => (inMs(row) ? v / 1000 : v)
const stored = (row: TuningRow, v: number) => (inMs(row) ? Math.round(v * 1000) : v)
const unitOf = (row: TuningRow) => (row.unit ? ` ${row.unit}` : '')
const testId = (path: string) => `listener-setting-${path.replace(/\./g, '-')}`

export function ListenerTuning({ settings, choices }: { settings: PlaygroundSettings; choices?: ModelChoices }) {
  const { listener, ownTiming, lineDirection } = useSyncExternalStore(settings.subscribe, settings.get)
  const directed = lineDirection === 'stored'
  const set = (row: TuningRow, value: number) => {
    if (row.path.startsWith('own.')) settings.patch({ ownTiming: { ...ownTiming, [row.path.slice(4)]: value } })
    else settings.patch({ listener: listenerWith(listener, row.path, value) })
  }
  return (
    <div className="flex flex-col gap-2" data-testid="listener-tuning">
      <label className="flex items-center justify-between gap-2 text-micro text-text-secondary">
        <span>Hand over carries its answer (shown here only)</span>
        <span data-testid="listener-setting-withAnswer" data-on={listener.withAnswer}>
          <AutomationSwitch label="Hand over carries its answer" on={listener.withAnswer} onChange={on => settings.patch({ listener: { ...listener, withAnswer: on } })} />
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-micro text-text-secondary">
        <span>Light model gives its reason (slower; for debugging the prompt)</span>
        <span data-testid="listener-setting-withReason" data-on={listener.withReason}>
          <AutomationSwitch label="Light model gives its reason" on={listener.withReason} onChange={on => settings.patch({ listener: { ...listener, withReason: on } })} />
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-micro text-text-secondary">
        <span>Lines in the stored phrases' tone (off: plain, as hq)</span>
        <span data-testid="listener-setting-lineDirection" data-on={directed}>
          <AutomationSwitch label="Lines in the stored phrases' tone" on={directed} onChange={on => settings.patch({ lineDirection: on ? 'stored' : 'plain' })} />
        </span>
      </label>
      {TUNING_GROUPS.map(group => (
        <section key={group.title} aria-label={group.title}>
          <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">{group.title}</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {group.rows.map(row => {
              const { min, max } = limitsOf(row.path)
              const value = valueAt(row.path, listener, ownTiming)
              return (
                <label key={row.path} className="flex min-w-0 flex-col text-micro text-text-secondary">
                  <span className="flex justify-between gap-2">
                    <span className="min-w-0 leading-tight" title={row.label}>{row.label}</span>
                    <span className="shrink-0 font-medium tabular-nums text-text-primary">{shown(row, value)}{unitOf(row)}</span>
                  </span>
                  <input
                    type="range" aria-label={row.label} data-testid={testId(row.path)} className="w-full accent-accent"
                    min={shown(row, min)} max={shown(row, max)} step={row.step} value={shown(row, value)}
                    onChange={e => set(row, stored(row, Number(e.target.value)))}
                  />
                </label>
              )
            })}
          </div>
        </section>
      ))}
      <BackchannelTuning settings={settings} choices={choices} />
      <PacingTuning settings={settings} />
      <BargeInTuning settings={settings} />
      <ToneTuning settings={settings} />
      <p className="text-micro text-text-muted">Changes apply to the next call. One JSON object is the only format hq's call sends today.</p>
    </div>
  )
}
