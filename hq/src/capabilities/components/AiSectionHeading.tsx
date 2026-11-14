import type { ReactNode } from 'react'

/** The heading of one of the AI page's sections. */
export function AiSectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="mb-2 text-h3 font-medium text-text-primary">{children}</h2>
}
