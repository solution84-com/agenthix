import type { ReactNode } from 'react'
import type { ExecutionState } from '@agenthix/core'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AgentAvatar } from '@agenthix/ui/sessions'
import { TaskHeaderChip } from './TaskHeaderChip'
import type { PlaceChoice } from './taskPlace'

export interface TaskHeaderPlace {
  name: string
  choices: PlaceChoice[]
  /** Absent where the person may not change it. */
  onChoose?: (id: string) => void
}

/**
 * A task page's header (TK1), kept in view: its key, its type and its column (by name only, each a chip that sets
 * it), its agent with the run's ring and the run in words (D18); then Talk about this task, the one filled button for
 * the state, and ⋯. An epic says it is never run where a task has its agent. On a phone the key is the top bar's
 * title and the actions are behind its ⋯ (`actionsInTopBar`), so the row holds the two chips.
 */
export function TaskHeader({ taskKey, type, column, agent, note, talk, primary, menu, keyInTopBar = false, actionsInTopBar = false, loading = false }: {
  taskKey: string
  type?: (TaskHeaderPlace & { icon: string }) | null
  column?: TaskHeaderPlace | null
  /** The assigned agent, its run as the ring, and the words beside it: "Not started", "Running · 1 min". */
  agent?: { name: string; state?: ExecutionState | null; words: string } | null
  /** Where an epic has no run to show: "never run". */
  note?: string
  talk?: ReactNode
  primary?: ReactNode
  menu?: ReactNode
  /** Below `lg` the top bar is titled with the key, so the row leaves it out. */
  keyInTopBar?: boolean
  /** Below `lg` the top bar's ⋯ holds Talk, the button and ⋯'s items. */
  actionsInTopBar?: boolean
  /** While the task loads: the key alone, so nothing jumps when it arrives. */
  loading?: boolean
}) {
  const onPhoneOnly = actionsInTopBar ? 'max-lg:hidden' : ''
  return (
    <header
      aria-label="Task" aria-busy={loading || undefined}
      className={`sticky top-0 z-10 flex min-h-[52px] flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-1 px-6 py-2 max-sm:flex-nowrap max-sm:px-3 ${keyInTopBar && loading ? 'max-lg:hidden' : ''}`}
    >
      <span className={`shrink-0 text-small font-medium text-text-muted ${keyInTopBar ? 'max-lg:hidden' : ''}`}>{taskKey}</span>
      {type && <TaskHeaderChip label="Type" name={type.name} icon={type.icon} choices={type.choices} onChoose={type.onChoose} testId="task-type" />}
      {column && <TaskHeaderChip label="Column" name={column.name} choices={column.choices} onChoose={column.onChoose} testId="task-column" />}
      {agent && (
        <span className="flex min-w-0 items-center gap-1.5 text-small text-text-secondary max-lg:hidden">
          <RunAvatar name={agent.name} state={agent.state}><AgentAvatar name={agent.name} size="sm" /></RunAvatar>
          <span data-testid="task-run-words" className="min-w-0 truncate">{agent.name} · {agent.words}</span>
        </span>
      )}
      {note && <span className="text-small text-text-muted max-lg:hidden">{note}</span>}
      {!loading && (talk || primary || menu) && (
        <div className={`ml-auto flex shrink-0 items-center gap-2 ${onPhoneOnly}`}>
          {talk && <span className={actionsInTopBar ? 'contents' : 'max-sm:hidden'}>{talk}</span>}
          {primary}
          {menu}
        </div>
      )}
    </header>
  )
}
