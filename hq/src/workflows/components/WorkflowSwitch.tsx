import { Switch, type Refusal } from '@agenthix/ui/primitives'

/** The On/Off switch. Read-only for those who may not turn a workflow on or off: they see the state in words. */
export function WorkflowSwitch({ on, label, onToggle, busy, refusal }: { on: boolean; label: string; onToggle?: () => void; busy?: boolean; refusal?: Refusal }) {
  if (!onToggle) {
    return <span className="text-small text-text-secondary" data-testid="workflow-state">{on ? 'On' : 'Off'}</span>
  }
  return <Switch on={on} label={label} disabled={busy} refusal={refusal} onChange={onToggle} />
}
