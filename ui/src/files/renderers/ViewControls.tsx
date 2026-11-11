import type { ReactNode } from 'react'
import { CONTROL_HEIGHT, FOCUS_RING } from '../../primitives/controlStyles'
import { SegmentedControl } from '../../primitives/SegmentedControl'

/** The one switch between a file's views (Read · Source, Tree · Text, Fit · 100%): a segmented control, as tabs. */
export function ViewTabs<T extends string>({ label, tabs, value, onChange }: {
  label: string
  tabs: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return <SegmentedControl kind="tabs" label={label} options={tabs} value={value} onChange={onChange} />
}

/** A button that is on or off (Wrap): the selected fill while on, at control height, the outlined look otherwise. */
export function ToggleButton({ pressed, onChange, children }: { pressed: boolean; onChange: (pressed: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button" aria-pressed={pressed} onClick={() => onChange(!pressed)}
      className={`inline-flex shrink-0 items-center rounded-lg border border-border px-3 text-small transition-colors ${CONTROL_HEIGHT} ${FOCUS_RING} ${
        pressed ? 'bg-selected font-medium text-text-primary' : 'bg-button-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed'
      }`}
    >
      {children}
    </button>
  )
}
