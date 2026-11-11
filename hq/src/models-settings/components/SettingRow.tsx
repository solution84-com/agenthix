import type { ReactNode } from 'react'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'

export const LINK = `rounded text-small font-medium text-link not-disabled:hover:underline ${DISABLED} ${FOCUS_RING}`

/**
 * One setting on Models, an agent's page and setup's last look: its name, what is chosen in one line, at most one
 * plain line under it, and what changes it on the right.
 */
export function SettingRow({ label, lead, value, hint, actions }: {
  label: string
  /** Beside the value, before it: a voice's play button. */
  lead?: ReactNode
  value: ReactNode
  hint?: ReactNode
  actions: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-small font-medium text-text-primary">{label}</div>
        <div className="mt-0.5 flex items-center gap-2 text-body text-text-primary">
          {lead}
          <span className="min-w-0">{value}</span>
        </div>
        {hint && <p className="mt-0.5 text-small text-text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 pt-0.5">{actions}</div>
    </div>
  )
}

/** The section heading above a group of rows. */
export function RowsHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-micro font-medium uppercase tracking-wide text-text-muted">{children}</h3>
}

/** Where a setting comes from, after its value: the organisation's, or the agent's own. */
export function Whose({ text }: { text: string }) {
  return <span className="text-text-muted"> · {text}</span>
}
