export interface SystemLoadIndicatorProps {
  activeSessions: number
  totalAgents: number
}

export function SystemLoadIndicator({ activeSessions, totalAgents }: SystemLoadIndicatorProps) {
  const ratio = totalAgents > 0 ? Math.min(1, activeSessions / totalAgents) : 0
  const pct = Math.round(ratio * 100)
  const tone =
    ratio >= 0.9 ? 'bg-danger'
    : ratio >= 0.6 ? 'bg-warning'
    : 'bg-success'

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface-1 border border-border-subtle">
      <span className={`relative flex h-1.5 w-1.5`}>
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${tone}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${tone}`} />
      </span>
      <span className="text-micro font-medium uppercase tracking-wide text-text-secondary">
        Load
      </span>
      <span className="text-small font-medium text-text-primary tabular-nums">
        {activeSessions}<span className="text-text-muted">/{totalAgents}</span>
      </span>
      <span className="text-micro text-text-muted tabular-nums">{pct}%</span>
    </div>
  )
}
