import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface ViewHeaderSlot {
  /** Where a view's header is drawn: the panel's header row. Null until the panel has mounted it. */
  element: HTMLElement | null
  /** A view calls this while it is drawn; the panel hides its own header until it is released. */
  claim: () => () => void
}

export const ViewHeaderContext = createContext<ViewHeaderSlot | null>(null)

/**
 * The one header row of a view inside a panel: back to its parent, its title, its action at the right.
 * Inside a panel that offers a slot it replaces the panel's own header; elsewhere it draws in place.
 */
export function ViewHeaderRow({ children }: { children: ReactNode }) {
  const slot = useContext(ViewHeaderContext)
  const claim = slot?.claim
  useLayoutEffect(() => claim?.(), [claim])
  if (!slot) return <div className="flex items-center gap-2 px-4 pt-4">{children}</div>
  if (!slot.element) return null
  return createPortal(<div className={PANEL_HEADER_ROW}>{children}</div>, slot.element)
}

/** The row every panel header sits in, the panel's own and each view's, so moving between them never shifts. */
export const PANEL_HEADER_ROW = 'flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3'

// The chevron is drawn inline: hq's tests resolve lucide from hq, and a second copy here breaks React's context.
/** What a panel header holds: "‹ back", the title, and an action at the right. Shared so every header lines up. */
export function PanelHeaderContent({ back, onBack, title, action }: {
  back?: string
  onBack?: () => void
  title?: string
  action?: ReactNode
}) {
  return (
    <>
      {back && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 text-small text-accent hover:bg-surface-hover"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
          {back}
        </button>
      )}
      {title && <h3 className="min-w-0 truncate text-h3 font-semibold text-text-primary">{title}</h3>}
      {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
    </>
  )
}
