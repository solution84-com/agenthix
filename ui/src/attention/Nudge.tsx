import type { ReactNode } from 'react'
import { Button } from '../primitives/Button'
import { FOCUS_RING } from '../primitives/controlStyles'
import { InfoGlyph } from '../primitives/Glyphs'

/**
 * Where a nudge sits, always a slot the screen has anyway: `content` in place of what could not be shown (it replaces
 * the empty state); `meta` a line of its own under a page's or section's count; `row` inline in a row's detail;
 * `thread` a quiet row after a thread's last message, indented under the agent.
 */
export type NudgePlace = 'content' | 'meta' | 'row' | 'thread'

/** The one plain-text action a nudge may carry ("Try again", "Which", "Dismiss"). */
export type NudgeAction = { label: string; onClick: () => void }

export interface NudgeProps {
  place: NudgePlace
  /** The words. Nothing is drawn without them (unless `reserve`). */
  children?: ReactNode
  /** In place of the content only: the line above the words, as "The providers could not be read". */
  title?: string
  action?: NudgeAction
  /** For a slot the screen keeps whether or not there is a nudge: drawn empty, at the same height, without words. */
  reserve?: boolean
}

// One line of small secondary text; `min-h` keeps a reserved slot at that line's height when it is empty.
const LINE = 'min-h-5 text-small text-text-secondary'
const PLACE: Record<Exclude<NudgePlace, 'content'>, string> = {
  meta: `block ${LINE}`,
  row: `inline ${LINE}`,
  thread: `block ${LINE} ml-9 py-1`,
}

function Icon() {
  return <InfoGlyph size={13} className="mr-1.5 inline-block align-[-2px]" />
}

function PlainAction({ action }: { action: NudgeAction }) {
  return (
    <button type="button" onClick={action.onClick} className={`ml-1 whitespace-nowrap rounded-sm text-text-primary underline underline-offset-2 hover:text-text-secondary ${FOCUS_RING}`}>
      {action.label}
    </button>
  )
}

/**
 * The soft nudge (DESIGN-SYSTEM.md, *Messages*): something shown is incomplete or out of date, and the person can
 * carry on. One run of small secondary text, a small outline icon, the words and at most one plain-text action, which
 * wrap together as one sentence; no box, no fill, no state colour. A screen reader hears it without being interrupted.
 */
export function Nudge({ place, children, title, action, reserve = false }: NudgeProps) {
  const empty = children === null || children === undefined || children === false || children === ''
  if (place === 'content') {
    if (empty && !title) return null
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center px-4 py-16 text-center">
        {title && <p className="text-body font-medium text-text-primary"><Icon />{title}</p>}
        {!empty && <p className="mt-1 text-small text-text-secondary">{children}</p>}
        {action && <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={action.onClick}>{action.label}</Button>}
      </div>
    )
  }
  const Tag = place === 'row' ? 'span' : 'div'
  if (empty) return reserve ? <Tag aria-hidden data-nudge-slot className={PLACE[place]} /> : null
  return (
    <Tag role="status" aria-live="polite" data-nudge-slot className={PLACE[place]}>
      <Icon />{children}{action && <>{' '}<PlainAction action={action} /></>}
    </Tag>
  )
}
