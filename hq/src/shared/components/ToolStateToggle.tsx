/**
 * ToolStateToggle
 * ===============
 * Compact inline three-segment toggle for always / ask / never tool states.
 * Used in ConfigurationTab and SystemCapabilitiesSection.
 */
import type { ToolPermissionState } from '@agenthix/core'
import { SegmentedControl } from '@agenthix/ui/primitives'

const SEGMENTS: { state: ToolPermissionState; label: string }[] = [
  { state: 'always', label: 'Always' },
  { state: 'ask',    label: 'Ask' },
  { state: 'never',  label: 'Never' },
]

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
      <button type="button" onClick={() => onSetAll('always')} className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Always</button>
      <button type="button" onClick={() => onSetAll('ask')}    className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Ask</button>
      <button type="button" onClick={() => onSetAll('never')}  className="text-micro font-medium text-text-secondary hover:text-text-primary cursor-pointer transition-colors">Never</button>
    </div>
  )
}

export function ToolStateToggle({ state, onChange, disabled }: Props) {
  return (
    <SegmentedControl
      label="Tool permission"
      value={state}
      onChange={onChange}
      disabled={disabled}
      options={SEGMENTS.map(({ state: value, label }) => ({ value, label }))}
    />
  )
}
