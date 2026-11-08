import { RunAvatar } from '@agenthix/ui/tasks'
import type { TaskState } from '@agenthix/core'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { ColumnChip } from '../components/TypeStateColumns'
import type { BoardCard } from '../boardCardService'

/** The parts of a task row on Sprints and Plan Sprint, which read the board's card shape. */
export type SprintCard = Pick<BoardCard, 'id' | 'key' | 'title' | 'executionState' | 'epicId' | 'type' | 'column'> & {
  state: TaskState
  agent: { id: string; name: string; avatarUrl: string | null } | null
}

/** The task's agent, its avatar ringed with the run (D18), or a dashed circle where it has none. */
export function SprintAgentMark({ task }: { task: SprintCard }) {
  if (!task.agent) {
    return <span role="img" aria-label="No agent" title="No agent" className="m-[3px] inline-block h-8 w-8 shrink-0 rounded-full border border-dashed border-border-strong" />
  }
  return (
    <RunAvatar name={task.agent.name} state={task.executionState} size="md">
      <AuthedAgentAvatar name={task.agent.name} avatarUrl={task.agent.avatarUrl} size="md" />
    </RunAvatar>
  )
}

/** The key, the type and the column under a task's title: column names only, never the state (spec). */
export function SprintTaskFacts({ task }: { task: SprintCard }) {
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-2">
      <span className="shrink-0 font-mono text-micro text-text-muted">{task.key}</span>
      {task.type && <span className="truncate text-micro text-text-secondary">{task.type.name}</span>}
      {task.column && <ColumnChip name={task.column.name} />}
    </span>
  )
}
