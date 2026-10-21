// Schema enum values: TODO | IN_PROGRESS | DONE.
// Matches site's inline status badge style so site and HQ are visually identical.
export interface StatusBadgeProps {
  status: string
  className?: string
}

const COLOR_MAP: Record<string, string> = {
  TODO:        'bg-surface-3 text-text-secondary',
  IN_PROGRESS: 'bg-accent/20 text-accent',
  DONE:        'bg-success/20 text-success',
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-block text-micro font-medium uppercase tracking-wide px-2 py-1 rounded-lg ${COLOR_MAP[status] ?? 'bg-surface-3 text-text-muted'} ${className}`}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
