import { PRIORITY_SELECTED_CLASSES } from '../tasks/priorityColors'

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

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`flex-1 px-2 py-1.5 rounded-lg text-micro font-medium uppercase tracking-wide border transition-all ${
            value === opt.value
              ? PRIORITY_SELECTED_CLASSES[opt.value]
              : 'border-border bg-surface-2 text-text-muted hover:border-border'
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
