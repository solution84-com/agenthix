import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { EpicBadge, type StateTone } from '@agenthix/ui/tasks'
import { AgentAvatar } from '@agenthix/ui/sessions'

// The state's tone is its fill and its dot; its words stay in the primary text colour so they read at 4.5:1 on any fill.
const TONE: Record<StateTone, { chip: string; dot: string }> = {
  needs: { chip: 'bg-warning/15', dot: 'bg-warning' },
  live: { chip: 'bg-success/15', dot: 'bg-success' },
  muted: { chip: 'bg-surface-2', dot: 'bg-text-muted' },
}

export interface TaskHeaderColumn {
  value: string
  options: { value: string; label: string }[]
  /** Moves the task; absent where the person may not. */
  onChange?: (value: string) => void
}

/**
 * A task page's header (T0), kept in view: its key, its state (an epic's mark), its column (the column is the status),
 * its agent; then Talk about this task, the one button for the state, and ⋯. The column is a chip like the state
 * beside it, and is left out where the state already says the same word; it is the task's one column control. On a
 * phone it is one row: the state and the column (each ending with … when long), the button and ⋯; the key is the top
 * bar's title where `keyInTopBar`, the agent is in Details, and Talk is in ⋯.
 */
export function TaskHeader({ taskKey, state, column, agentName, talk, primary, menu, epic = false, keyInTopBar = false }: {
  taskKey: string
  state: { text: string; tone: StateTone; title?: string | null }
  column: TaskHeaderColumn | string
  agentName?: string | null
  talk?: ReactNode
  primary?: ReactNode
  menu?: ReactNode
  /** An epic: its mark in place of a state. */
  epic?: boolean
  /** Below `lg` the top bar is titled with the key, so the row leaves it out. */
  keyInTopBar?: boolean
}) {
  const label = typeof column === 'string' ? column : column.options.find(o => o.value === column.value)?.label ?? 'Backlog'
  const sameWord = !epic && label.toLowerCase() === state.text.toLowerCase()
  return (
    <header
      aria-label="Task"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-border-subtle bg-surface-0 px-4 py-2 max-sm:flex-nowrap"
    >
      <span className={`shrink-0 text-small font-medium text-text-muted ${keyInTopBar ? 'max-lg:hidden' : ''}`}>{taskKey}</span>
      {epic ? <EpicBadge /> : !sameWord && (
        <span title={state.title ?? state.text} className={`flex min-w-0 max-w-[14rem] items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium text-text-primary ${TONE[state.tone].chip}`}>
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[state.tone].dot}`} />
          <span data-testid="task-state" className="min-w-0 truncate">{state.text}</span>
        </span>
      )}
      <span className="contents">
        {typeof column !== 'string' && column.onChange ? (
          // The chip is drawn as words that end with … when long; the browser's select lies over it, unseen, so it
          // takes clicks and the keyboard, and never runs under the button.
          <span className="relative flex min-w-0 max-w-[14rem] shrink max-sm:min-h-11 max-sm:items-center">
            <select
              aria-label="Column" value={column.value} onChange={e => column.onChange?.(e.target.value)}
              className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 [&>option]:bg-surface-1"
            >
              {column.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span
              aria-hidden data-testid="task-column"
              className="pointer-events-none flex min-w-0 items-center gap-1 rounded-full border border-border bg-surface-1 py-0.5 pl-2 pr-1.5 text-micro font-medium text-text-primary peer-hover:bg-surface-hover peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
            >
              <span className="min-w-0 truncate">{label}</span>
              <ChevronDown size={12} aria-hidden className="shrink-0 text-text-muted" />
            </span>
          </span>
        ) : (
          <span data-testid="task-column" title={label} className="block min-w-0 max-w-[14rem] truncate rounded-full border border-border bg-surface-1 px-2 py-0.5 text-micro font-medium text-text-primary">{label}</span>
        )}
      </span>
      {agentName && (
        <span className="flex items-center gap-1.5 text-small text-text-secondary max-sm:hidden">
          <AgentAvatar name={agentName} size="sm" />
          {agentName}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {talk && <span className="max-sm:hidden">{talk}</span>}
        {primary}
        {menu}
      </div>
    </header>
  )
}
