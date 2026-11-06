import type { ReactNode } from 'react'
import type { StateTone } from '@agenthix/ui/tasks'

const TONE: Record<StateTone, string> = {
  needs: 'bg-warning/15 text-warning',
  live: 'bg-success/15 text-success',
  muted: 'bg-surface-2 text-text-secondary',
}

const CHIP = 'inline-flex max-w-[14rem] items-center truncate rounded-full px-2 py-0.5 text-micro font-medium'

export interface TaskHeaderColumn {
  value: string
  options: { value: string; label: string }[]
  /** Moves the task; absent where the person may not. */
  onChange?: (value: string) => void
}

/**
 * A task page's header (T0), kept in view: its key, its state, its column (the column is the status), its agent;
 * then Talk about this task, the one button for the state, and ⋯.
 */
export function TaskHeader({ taskKey, state, column, agentName, talk, primary, menu }: {
  taskKey: string
  state: { text: string; tone: StateTone; title?: string | null }
  column: TaskHeaderColumn | string
  agentName?: string | null
  talk?: ReactNode
  primary?: ReactNode
  menu?: ReactNode
}) {
  const label = typeof column === 'string' ? column : column.options.find(o => o.value === column.value)?.label ?? 'Backlog'
  return (
    <header
      aria-label="Task"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border-subtle bg-surface-0 px-4 py-2"
    >
      <span className="text-small font-medium text-text-muted">{taskKey}</span>
      <span data-testid="task-state" title={state.title ?? undefined} className={`${CHIP} ${TONE[state.tone]}`}>{state.text}</span>
      {typeof column !== 'string' && column.onChange ? (
        <select
          aria-label="Column" value={column.value} onChange={e => column.onChange?.(e.target.value)}
          className={`${CHIP} cursor-pointer border border-border bg-surface-1 text-text-primary hover:bg-surface-hover`}
        >
          {column.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <span data-testid="task-column" className={`${CHIP} border border-border bg-surface-1 text-text-primary`}>{label}</span>
      )}
      {agentName && (
        <span className="flex items-center gap-1.5 text-small text-text-secondary">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-subtle text-micro font-semibold text-accent">
            {agentName.charAt(0).toUpperCase()}
          </span>
          {agentName}
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {talk}
        {primary}
        {menu}
      </div>
    </header>
  )
}
