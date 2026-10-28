import type { ReactNode } from 'react'

/** One section of an asset's page: a heading, its count, and what is in it. */
export function Section({ title, count, aside, children, testId }: { title: string; count?: number; aside?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="rounded-xl border border-border-subtle bg-surface-1 p-4" data-testid={testId} aria-label={title}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="text-body font-semibold text-text-primary">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-micro text-text-secondary">{count}</span>}
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>
      {children}
    </section>
  )
}

export const SMALL_BUTTON = 'rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40'
export const PRIMARY_BUTTON = 'rounded-lg bg-accent px-3 py-1.5 text-body font-medium text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40'
