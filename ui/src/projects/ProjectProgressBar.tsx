export interface ProjectExecutionCounts {
  total: number
  done: number
  active: number
  blocked: number
  idle: number
}

export interface ProjectProgressBarProps {
  counts: ProjectExecutionCounts
}

export function ProjectProgressBar({ counts }: ProjectProgressBarProps) {
  const { total, done, active, blocked, idle } = counts
  const completion = total > 0 ? Math.round((done / total) * 100) : 0
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)

  return (
    <div className="rounded-2xl bg-surface-1 border border-border-subtle p-6 space-y-4">
      <div className="text-micro font-medium text-text-muted uppercase tracking-wide">Task Progress</div>
      <div className="flex items-end gap-3">
        <div className="text-h1 font-semibold text-text-primary leading-none">
          {completion}
          <span className="text-h1 text-text-muted">%</span>
        </div>
        <div className="text-small text-text-muted mb-1">
          {done} of {total} tasks complete
        </div>
      </div>

      {/* Segmented progress bar */}
      <div className="h-2.5 rounded-full bg-surface-2 overflow-hidden flex gap-0.5">
        <div className="h-full bg-success transition-all" style={{ width: `${pct(done)}%` }} />
        <div className="h-full bg-accent transition-all"    style={{ width: `${pct(active)}%` }} />
        <div className="h-full bg-danger transition-all"     style={{ width: `${pct(blocked)}%` }} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { color: 'bg-success', label: 'Done',    count: done },
          { color: 'bg-accent',    label: 'Active',  count: active },
          { color: 'bg-danger',     label: 'Blocked', count: blocked },
          { color: 'bg-surface-hover',    label: 'Idle',    count: idle },
        ].map(({ color, label, count }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
            <span className="text-small text-text-muted">
              {label} <span className="text-text-secondary">{count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
