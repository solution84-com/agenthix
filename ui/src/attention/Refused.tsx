import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { DISABLED, FOCUS_RING, Tooltip, useRefusal, type Refusal } from '../primitives'

/**
 * A control (a switch, a set of checkboxes, a select) that cannot be used now, for a reason known in advance: it is
 * greyed and does nothing, its tooltip gives the reason, and pressing it, or Enter on it, opens the dialog with the full
 * explanation. `label` names it for a screen reader. Without a `refusal` the control is drawn as it is.
 */
export function Refused({ refusal, label, className = 'inline-flex', children }: { refusal?: Refusal; label: string; className?: string; children: ReactNode }) {
  const refused = useRefusal(refusal)
  if (!refusal || !refused.tooltip) return <>{children}</>
  const press = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') refused.props.onClick?.(e as unknown as MouseEvent) }
  return (
    <>
      <Tooltip label={refused.tooltip} side="top" wrap>
        <span {...refused.props} role="button" tabIndex={0} aria-label={`${label}, unavailable`} onKeyDown={press} className={`${className} rounded ${DISABLED} ${FOCUS_RING}`}>
          <span inert className="contents">{children}</span>
        </span>
      </Tooltip>
      {refused.dialog}
    </>
  )
}
