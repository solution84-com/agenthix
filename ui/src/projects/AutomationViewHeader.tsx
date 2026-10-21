import type { ReactNode } from 'react'
import { PanelHeaderContent, ViewHeaderRow } from '../primitives/ViewHeaderSlot'

/** The one header row of the Routines and Rules views: "‹ Automation", the view's name, and an optional action at the right. */
export function AutomationViewHeader({ title, onBack, action }: { title: string; onBack: () => void; action?: ReactNode }) {
  return (
    <ViewHeaderRow>
      <PanelHeaderContent back="Automation" onBack={onBack} title={title} action={action} />
    </ViewHeaderRow>
  )
}

/** A small uppercase section heading, as the tools panel's sections use. */
export function AutomationHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-micro font-medium uppercase tracking-wide text-text-muted">{children}</h4>
}

export const AUTOMATION_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-1 text-small font-medium text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-surface-1'
