import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { FOCUS_RING_INSET, FOCUS_RING } from '@agenthix/ui/primitives'

/** A heading over a group of entries. */
export function OrgEntryGroup({ title, all, children }: { title: string; all?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section aria-label={title} className="mb-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-micro font-medium uppercase tracking-wide text-text-muted">{title}</h2>
        {all && (
          <Link to={all.to} className={`rounded inline-flex items-center text-small font-medium text-link hover:underline ${FOCUS_RING}`}>
            {all.label}<ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      <div className="divide-y divide-border-subtle border-y border-border-subtle">{children}</div>
    </section>
  )
}

const ROW = 'flex items-center gap-3 py-3'

function RowBody({ title, line }: { title: ReactNode; line?: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-body font-medium text-text-primary">{title}</div>
      {line && <div className="truncate text-small text-text-muted">{line}</div>}
    </div>
  )
}

/** One entry: a name and a line saying what is there, opening its page. */
export function OrgEntryRow({ to, title, line }: { to: string; title: string; line?: ReactNode }) {
  return (
    <Link to={to} className={`${ROW} -mx-2 rounded-lg px-2 hover:bg-surface-hover active:bg-surface-pressed transition-colors ${FOCUS_RING_INSET}`}>
      <RowBody title={title} line={line} />
      <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
    </Link>
  )
}
