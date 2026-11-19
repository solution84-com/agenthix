/** The Settings tab's small shared pieces: a field's label and the one line a fallen-back pick is told in. */
import type { ReactNode } from 'react'

export const RowLabel = ({ children }: { children: ReactNode }) => (
  <span className="text-small font-medium text-text-primary">{children}</span>
)

export function StaleNote({ id, text }: { id: string; text: string | null }) {
  return text ? <p data-testid={id} role="status" className="text-micro text-warning">{text}</p> : null
}
