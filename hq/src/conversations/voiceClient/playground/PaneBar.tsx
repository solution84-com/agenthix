/** The Settings tab's section headings (Models, Tuning, Lab): a quiet bar with the section's name and its own small buttons. */
import type { ReactNode } from 'react'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

export function PaneBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-y border-border-subtle bg-surface-2 px-3 py-1.5">
      <h2 className="flex-1 text-micro font-medium uppercase tracking-wide text-text-muted">{title}</h2>
      {children}
    </div>
  )
}

export function BarButton({ onClick, disabled, children, testId }: { onClick: () => void; disabled?: boolean; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className={`rounded-button px-2 py-0.5 text-micro font-button max-sm:min-h-10 ${BUTTON_SECONDARY}`}
    >
      {children}
    </button>
  )
}
