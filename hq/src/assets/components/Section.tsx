import type { ReactNode } from 'react'
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from '@agenthix/ui/primitives'

/** One section of an asset's page: a heading, its count, and what is in it. */
export function Section({ title, count, aside, children, testId }: { title: string; count?: number; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid={testId} aria-label={title}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-body font-medium text-text-primary">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{count}</span>}
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>
      {children}
    </section>
  )
}

/** The secondary and the main button's looks (`BUTTON_SECONDARY`, `BUTTON_PRIMARY` from `@agenthix/ui/primitives`) at the sizes this area uses. */
export const SMALL_BUTTON = `rounded-lg px-3 py-1 text-small font-medium ${BUTTON_SECONDARY}`
export const PRIMARY_BUTTON = `rounded-lg px-3 py-1.5 text-body font-medium ${BUTTON_PRIMARY}`
