// Schema enum values: LOW | MEDIUM | HIGH (uppercase, matches TaskPriority in schema.prisma)
export interface PriorityBadgeProps {
  priority: string
  className?: string
}

const COLOR_MAP: Record<string, string> = {
  LOW:    'bg-surface-3 text-text-secondary',
  MEDIUM: 'bg-warning/20 text-warning',
  HIGH:   'bg-danger/20 text-danger',
}

export function PriorityBadge({ priority, className = '' }: PriorityBadgeProps) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-micro font-medium ${COLOR_MAP[priority] ?? 'bg-surface-3 text-text-secondary'} ${className}`}
    >
      {priority.toLowerCase()}
    </span>
  )
}
