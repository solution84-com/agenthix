export interface TaskCounts {
  todo: number
  inProgress: number
  done: number
  total?: number
}

export interface ProjectStatsProps {
  taskCounts: TaskCounts
  agentMemberCount?: number
}

export function ProjectStats({ taskCounts, agentMemberCount }: ProjectStatsProps) {
  return (
    <div className="px-6 py-3 grid grid-cols-4 gap-3">
      <Stat label="To Do"       value={taskCounts.todo}       color="text-text-secondary" />
      <Stat label="In Progress" value={taskCounts.inProgress} color="text-accent" />
      <Stat label="Done"        value={taskCounts.done}       color="text-success" />
      {agentMemberCount !== undefined && (
        <Stat label="Agents" value={agentMemberCount} color="text-text-secondary" />
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-border p-3">
      <div className="text-micro font-medium uppercase tracking-wide text-text-muted">{label}</div>
      <div className={`text-h1 font-semibold ${color} mt-1`}>{value}</div>
    </div>
  )
}
