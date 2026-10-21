export interface KeyBadgeProps {
  taskKey: string
  className?: string
}

export function KeyBadge({ taskKey, className = '' }: KeyBadgeProps) {
  return (
    <span className={`font-mono text-small bg-surface-3 px-1.5 py-0.5 rounded text-warning ${className}`}>
      {taskKey}
    </span>
  )
}
