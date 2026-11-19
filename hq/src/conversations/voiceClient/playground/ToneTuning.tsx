/**
 * The "Tone" group of Settings › Tuning (spec §Tone): its one switch — off, every layer speaks calm, the voice profile
 * is not asked for and no voice hint is offered (from the next speech connection for the profile) — the voice hint's
 * and the laugh back's confidence bars, and the language Inworld's speech to text is told. A change applies at the
 * next question to a model.
 */
import { useSyncExternalStore } from 'react'
import { AutomationSwitch } from '@agenthix/ui'
import { readTone, TONE_LIMITS, type SpeechLanguage, type ToneSettings } from '../tone/settings'
import type { PlaygroundSettings } from './settings'

const LANGUAGES: { value: SpeechLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'any', label: 'Detect it' },
]

function Bar({ id, label, value, onChange }: { id: keyof typeof TONE_LIMITS; label: string; value: number; onChange: (v: number) => void }) {
  const { min, max } = TONE_LIMITS[id]
  return (
    <label className="flex min-w-0 flex-col text-micro text-text-secondary">
      <span className="flex justify-between gap-2">
        <span className="min-w-0 leading-tight" title={label}>{label}</span>
        <span className="shrink-0 font-medium tabular-nums text-text-primary">{value.toFixed(2)}</span>
      </span>
      <input
        type="range" aria-label={label} data-testid={`tone-setting-${id}`} className="w-full accent-accent"
        min={min} max={max} step={0.05} value={value} onChange={e => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Switch({ id, label, on, onChange }: { id: string; label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mb-1.5 flex items-center justify-between gap-2 text-micro text-text-secondary">
      <span>{label}</span>
      <span data-testid={`tone-setting-${id}`} data-on={on}><AutomationSwitch label={label} on={on} onChange={onChange} /></span>
    </label>
  )
}

export function ToneTuning({ settings }: { settings: PlaygroundSettings }) {
  const { tone } = useSyncExternalStore(settings.subscribe, settings.get)
  const set = (patch: Partial<ToneSettings>) => settings.patch({ tone: readTone({ ...tone, ...patch }) })
  return (
    <section aria-label="Tone" data-testid="tone-tuning">
      <h3 className="mb-1 text-micro font-medium uppercase tracking-wide text-text-muted">Tone</h3>
      <Switch id="on" label="Each part speaks in the tone it picks, and hears how you sound (off: all calm)" on={tone.on} onChange={on => set({ on })} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <Bar id="voiceConfidence" label="How you sound counts at" value={tone.voiceConfidence} onChange={voiceConfidence => set({ voiceConfidence })} />
        <Bar id="laughConfidence" label="A laugh back when laughing is at least" value={tone.laughConfidence} onChange={laughConfidence => set({ laughConfidence })} />
        <div className="flex min-w-0 flex-col text-micro text-text-secondary">
          <span className="leading-tight">Your language (Inworld; from the next connection)</span>
          <div role="radiogroup" aria-label="Your language" data-testid="tone-setting-language" className="flex flex-wrap gap-1">
            {LANGUAGES.map(l => (
              <button
                key={l.value} type="button" role="radio" aria-checked={tone.speechLanguage === l.value}
                onClick={() => set({ speechLanguage: l.value })}
                className={`rounded border border-border px-1.5 text-text-primary hover:bg-surface-hover ${tone.speechLanguage === l.value ? 'bg-chip' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
