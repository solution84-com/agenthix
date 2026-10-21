const STATUS_STYLES: Record<string, string> = {
  TODO:        'bg-surface-2 text-text-muted',
  IN_PROGRESS: 'bg-accent/10 text-accent',
  DONE:        'bg-success/10 text-success',
}
const STATUS_LABELS: Record<string, string> = {
  TODO: 'Todo', IN_PROGRESS: 'In Progress', DONE: 'Done',
}

export function ColumnStatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-micro font-medium px-1.5 py-0.5 rounded ${STATUS_STYLES[status] ?? 'bg-surface-2 text-text-muted'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
