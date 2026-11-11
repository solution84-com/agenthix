import type { DashboardSnapshot } from '@agenthix/core'

export interface RunsOverviewProps {
  runs: DashboardSnapshot['runs']
}

export function RunsOverview({ runs }: RunsOverviewProps) {
  const cells: Array<{ label: string; num: number; tone: 'accent' | 'success' | 'warn' | 'fail' }> = [
    { label: 'Total Runs', num: runs.total, tone: 'accent' },
    { label: 'Completed', num: runs.completed, tone: 'success' },
    { label: 'Running', num: runs.running, tone: 'warn' },
    { label: 'Failed', num: runs.failed, tone: 'fail' },
  ]
  const tone = (t: typeof cells[number]['tone']) =>
    t === 'accent' ? 'text-text-primary'
    : t === 'success' ? 'text-success'
    : t === 'warn' ? 'text-warning'
    : 'text-danger'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {cells.map((c) => (
        <div key={c.label} className="bg-card border border-border rounded-lg p-3">
          <div className="text-micro font-medium uppercase tracking-wide text-text-muted mb-1.5">
            {c.label}
          </div>
          <div className={`text-h1 font-medium leading-none ${tone(c.tone)}`}>{c.num}</div>
        </div>
      ))}
    </div>
  )
}
