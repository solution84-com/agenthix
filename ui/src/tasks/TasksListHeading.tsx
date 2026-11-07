import type { ReactNode } from 'react'

/**
 * A task list's heading, drawn as every list page's is (a project's Members): the title, a line of counts under it,
 * and the page's one primary action at the right. `compact` is for where a phone's top bar already names the view and
 * holds the action: below `lg` only the counts stay.
 */
export function TasksListHeading({ title, counts, action, compact = false, level = 2 }: {
  title: string
  counts: string | null
  action?: ReactNode
  compact?: boolean
  /** h1 where the list is the page (Your tasks), h2 inside a place's section. */
  level?: 1 | 2
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  const hide = compact ? 'max-lg:hidden' : ''
  return (
    <div className="flex items-start gap-3 px-4 pt-4">
      <div className="min-w-0 flex-1">
        <Heading className={`text-h2 font-semibold text-text-primary ${hide}`}>{title}</Heading>
        <p className="min-h-[1lh] text-small text-text-muted">{counts ?? ''}</p>
      </div>
      {action && <div className={`flex shrink-0 items-center gap-2 ${hide}`}>{action}</div>}
    </div>
  )
}
