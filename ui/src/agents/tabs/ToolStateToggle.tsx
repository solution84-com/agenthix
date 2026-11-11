/**
 * ToolStateToggle
 * ===============
 * Compact inline three-segment toggle for always / ask / never tool states.
 * Used in ConfigurationTab and SystemCapabilitiesSection.
 */
import { SEGMENT_CHOSEN, SEGMENT_PIECE, SEGMENT_PLAIN, SEGMENT_STRIP } from '../../primitives/controlStyles'
import type { ToolPermissionState } from '../permissionTypes'

const SEGMENTS: { state: ToolPermissionState; label: string }[] = [
  { state: 'always', label: 'Always' },
  { state: 'ask',    label: 'Ask' },
  { state: 'never',  label: 'Never' },
]

interface Props {
  state: ToolPermissionState
  onChange: (state: ToolPermissionState) => void
  disabled?: boolean
  /** The states to draw; the others are left out, not greyed. Defaults to all three. */
  offered?: readonly ToolPermissionState[]
  label?: string
}

interface SetAllProps {
  onSetAll: (state: ToolPermissionState) => void
}

export function SetAllControl({ onSetAll }: SetAllProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-micro text-text-muted/70">All:</span>
      <button type="button" onClick={() => onSetAll('always')} className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Always</button>
      <button type="button" onClick={() => onSetAll('ask')}    className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Ask</button>
      <button type="button" onClick={() => onSetAll('never')}  className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Never</button>
    </div>
  )
}

export function ToolStateToggle({ state, onChange, disabled, offered, label: groupLabel }: Props) {
  return (
    <div role="group" aria-label={groupLabel} className={`${SEGMENT_STRIP} h-auto! max-sm:h-auto! ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {SEGMENTS.filter(({ state: s }) => !offered || offered.includes(s)).map(({ state: s, label }) => {
        const active = s === state
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => !disabled && onChange(s)}
            className={`${SEGMENT_PIECE} py-0.5 text-micro ${active ? SEGMENT_CHOSEN : SEGMENT_PLAIN}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
