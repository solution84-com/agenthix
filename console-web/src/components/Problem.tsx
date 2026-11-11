import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'

/** A problem that is part of the thing shown (a move's, a join's), drawn in the page as part of it: its words and, when there is one, the action. */
export function Problem({ title, children, action }: { title?: string; children: ReactNode; action?: { label: string; onClick: () => void } }) {
  return (
    <section aria-label={title ?? 'What went wrong'} className="rounded-xl border border-border bg-card px-4 py-3 text-small text-text-primary">
      {title && <p className="font-semibold">{title}</p>}
      <p>{children}</p>
      {action && <div className="mt-2"><Button variant="secondary" onClick={action.onClick}>{action.label}</Button></div>}
    </section>
  )
}
