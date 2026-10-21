import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface EmptyStateProps {
  /** Shown in the view variant. */
  icon?: LucideIcon
  title: string
  hint?: string
  /**
   * `view` (the default) fills a view with its icon and words. `inline` is one line in a dashed outline, in the flow
   * where the list would be, with what to do about it beside it.
   */
  variant?: 'view' | 'inline'
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, hint, variant = 'view', action }: EmptyStateProps) {
  if (variant === 'inline') {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2.5 rounded-xl border border-dashed border-border bg-card px-4 py-3 text-small text-text-secondary">
        <span className="flex-1">
          {title}
          {hint && <span className="block text-micro text-text-muted">{hint}</span>}
        </span>
        {action}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-text-muted space-y-3">
      {Icon && <Icon size={48} strokeWidth={1.5} />}
      <p className="text-body font-medium">{title}</p>
      {hint && <span className="text-small">{hint}</span>}
      {action}
    </div>
  )
}
