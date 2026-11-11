import type { ReactNode } from 'react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '../primitives/buttonStyles'

const DOT: Record<string, string> = { HIGH: 'bg-danger', MEDIUM: 'bg-warning', LOW: 'bg-success' }

export function PriorityDot({ priority, className = '' }: { priority: string; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`${priority.toLowerCase()} priority`}
      title={`${priority.charAt(0)}${priority.slice(1).toLowerCase()} priority`}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[priority] ?? 'bg-text-muted'} ${className}`}
    />
  )
}

export const TASK_BUTTON = `inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-small font-medium ${BUTTON_SECONDARY}`

export const TASK_BUTTON_PRIMARY = `inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-small font-medium ${BUTTON_PRIMARY}`

/**
 * The one header row of a view inside the Tasks tool: "‹ Tasks" (or the task's key), the view's name, and an
 * action at the right. Without `back` it is the title and action alone, for a task's own page.
 */
export function TasksViewHeader({ back, onBack, title, action }: { back?: string; onBack?: () => void; title?: string; action?: ReactNode }) {
  return (
    <ViewHeaderRow>
      <PanelHeaderContent back={back} onBack={onBack} title={title} action={action} />
    </ViewHeaderRow>
  )
}

export function TaskGroupHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h4 className="flex items-center gap-2 text-micro font-medium uppercase tracking-wide text-text-muted">
      {children}
      {count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-text-secondary">{count}</span>}
    </h4>
  )
}
