import { SegmentedControl } from './SegmentedControl'

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

export interface PrioritySelectorProps {
  value: Priority
  onChange: (value: Priority) => void
}

const OPTIONS: { value: Priority; label: string }[] = [
  { value: 'LOW',    label: 'Low' },
  { value: 'MEDIUM', label: 'Med' },
  { value: 'HIGH',   label: 'High' },
]

/** A priority, one of three: a segmented control. */
export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return <SegmentedControl label="Priority" options={OPTIONS} value={value} onChange={onChange} />
}
