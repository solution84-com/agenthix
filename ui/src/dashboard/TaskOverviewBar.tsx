import type { DashboardSnapshot } from '@agenthix/core'

export interface TaskOverviewBarProps {
  taskCounts: DashboardSnapshot['taskCounts']
}

export function TaskOverviewBar({ taskCounts }: TaskOverviewBarProps) {
  const total = Math.max(taskCounts.total, 1)
  const seg = (n: number) => `${(n / total) * 100}%`
  const idleTotal = taskCounts.total - taskCounts.done - taskCounts.running - taskCounts.blocked - taskCounts.failed

  return (
    <>
      <div className="h-3.5 rounded-full overflow-hidden flex bg-surface-2 mb-4">
        <div className="bg-success" style={{ width: seg(taskCounts.done) }} />
        <div className="bg-accent" style={{ width: seg(taskCounts.running) }} />
        <div className="bg-warning" style={{ width: seg(taskCounts.blocked) }} />
        <div className="bg-danger" style={{ width: seg(taskCounts.failed) }} />
        <div className="bg-surface-3" style={{ width: seg(idleTotal) }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 text-small text-text-secondary">
        <Legend swatch="bg-success" count={taskCounts.done} label="Done" />
        <Legend swatch="bg-accent" count={taskCounts.running} label="Running" />
        <Legend swatch="bg-warning" count={taskCounts.blocked} label="Blocked" />
        <Legend swatch="bg-danger" count={taskCounts.failed} label="Failed" />
        <Legend swatch="bg-surface-3" count={idleTotal} label="Idle" />
      </div>
    </>
  )
}

function Legend({ swatch, count, label }: { swatch: string; count: number; label: string }) {
  return (
    <div>
      <span className={`inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle ${swatch}`} />
      <strong className="text-text-primary font-medium">{count}</strong> {label}
    </div>
  )
}
