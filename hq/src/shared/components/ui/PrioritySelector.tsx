import { SegmentedControl } from '@agenthix/ui/primitives'

type Priority = 'LOW' | 'MEDIUM' | 'HIGH'

interface PrioritySelectorProps { value: Priority; onChange: (value: Priority) => void }

const OPTIONS: { value: Priority; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Med' },
  { value: 'HIGH', label: 'High' },
]

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return <SegmentedControl label="Priority" value={value} onChange={onChange} options={OPTIONS} className="w-full [&>button]:flex-1" />
}
