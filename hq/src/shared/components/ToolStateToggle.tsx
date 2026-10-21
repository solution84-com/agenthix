/**
 * ToolStateToggle
 * ===============
 * Compact inline three-segment toggle for always / ask / never tool states.
 * Used in ConfigurationTab and SystemCapabilitiesSection.
 */
import type { ToolPermissionState } from '@agenthix/core'

const SEGMENTS: { state: ToolPermissionState; label: string }[] = [
  { state: 'always', label: 'Always' },
  { state: 'ask',    label: 'Ask' },
  { state: 'never',  label: 'Never' },
]

const ACTIVE_CLASSES: Record<ToolPermissionState, string> = {
  always: 'bg-accent/[0.18] text-accent',
  ask:    'bg-surface-3 text-text-muted',
  never:  'bg-surface-1 text-text-muted/70',
}

interface Props {
  state: ToolPermissionState
  onChange: (state: ToolPermissionState) => void
  disabled?: boolean
}

interface SetAllProps {
  onSetAll: (state: ToolPermissionState) => void
}

export function SetAllControl({ onSetAll }: SetAllProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-micro text-text-muted/70">All:</span>
      <button type="button" onClick={() => onSetAll('always')} className="text-micro font-semibold text-accent/70 hover:text-accent cursor-pointer transition-colors">Always</button>
      <button type="button" onClick={() => onSetAll('ask')}    className="text-micro font-semibold text-text-muted hover:text-text-secondary cursor-pointer transition-colors">Ask</button>
      <button type="button" onClick={() => onSetAll('never')}  className="text-micro font-semibold text-text-muted/70 hover:text-text-muted cursor-pointer transition-colors">Never</button>
    </div>
  )
}

export function ToolStateToggle({ state, onChange, disabled }: Props) {
  return (
    <div className={`inline-flex rounded-md border border-border overflow-hidden ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {SEGMENTS.map(({ state: s, label }) => {
        const active = s === state
        return (
          <button
            key={s}
            type="button"
            onClick={() => !disabled && onChange(s)}
            className={[
              'px-2 py-0.5 text-micro font-semibold transition-colors border-r border-border last:border-r-0',
              active ? ACTIVE_CLASSES[s] : 'text-text-muted hover:text-text-secondary bg-transparent',
            ].join(' ')}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
