import type { ReactNode } from 'react'

export const SECTION_LABEL = 'text-micro font-semibold uppercase tracking-wide text-text-muted'

/** A titled group on the list: its name and how many are in it, then its rows. */
export function SiteGroupSection({ title, count, action, children }: { title: string; count: number; action?: ReactNode; children?: ReactNode }) {
  return (
    <section aria-label={title} className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <h2 className={SECTION_LABEL}>{title} · {count}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function RowList({ children }: { children: ReactNode }) {
  return <div className="bg-surface-1 border border-border rounded-[10px] overflow-hidden divide-y divide-border">{children}</div>
}
