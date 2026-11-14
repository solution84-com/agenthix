import type { ReactNode } from 'react'

/**
 * The heading of one of the AI page's sections. `meta` (a "Not up to date" nudge) sits beside it, in the line the
 * heading has anyway, so it never moves what is below.
 */
export function AiSectionHeading({ id, children, meta }: { id: string; children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
      <h2 id={id} className="text-h3 font-medium text-text-primary">{children}</h2>
      {meta}
    </div>
  )
}
