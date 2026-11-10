import type { ReactNode } from 'react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../../primitives/controlStyles'

/** The one switch between a file's views (Read · Source, Tree · Text, Fit · 100%): a segmented control at control height. */
export function ViewTabs<T extends string>({ label, tabs, value, onChange }: {
  label: string
  tabs: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex gap-1 rounded-lg border border-border bg-surface-1 p-0.5 ${CONTROL_HEIGHT}`}>
      {tabs.map(t => (
        <button
          key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={`rounded-md px-3 text-small font-medium transition-colors ${FOCUS_RING} ${
            value === t.value ? 'bg-selected text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

/** A button that is on or off (Wrap): the selected fill while on, at control height, the outlined look otherwise. */
export function ToggleButton({ pressed, onChange, children }: { pressed: boolean; onChange: (pressed: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={pressed} onClick={() => onChange(!pressed)}
      className={`inline-flex shrink-0 items-center rounded-lg border border-border px-3 text-small font-medium transition-colors ${CONTROL_HEIGHT} ${FOCUS_RING} ${
        pressed ? 'bg-selected text-text-primary' : 'bg-surface-1 text-text-primary hover:bg-surface-hover'
      }`}
    >
      {children}
    </button>
  )
}
