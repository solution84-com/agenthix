import { cloneElement, useEffect, useState, type FocusEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** The name shown beside the control. The control itself carries the same words as its accessible name. */
  label: string
  /** Hidden while true, such as when the control's own menu is open over the same spot. */
  disabled?: boolean
  /** Which side of the control the tooltip opens on. */
  side?: 'left' | 'right' | 'top' | 'bottom'
  /** The one control it names: an icon-only button or link. */
  children: ReactElement<{ onMouseEnter?: (e: never) => void; onMouseLeave?: (e: never) => void; onFocus?: (e: FocusEvent) => void; onBlur?: (e: FocusEvent) => void; 'aria-describedby'?: string }>
}

interface At { left: number; top: number; transform: string }

const GAP = 8

function place(el: Element, side: NonNullable<TooltipProps['side']>): At {
  const r = el.getBoundingClientRect()
  if (side === 'right') return { left: r.right + GAP, top: r.top + r.height / 2, transform: 'translateY(-50%)' }
  if (side === 'left') return { left: r.left - GAP, top: r.top + r.height / 2, transform: 'translate(-100%, -50%)' }
  if (side === 'top') return { left: r.left + r.width / 2, top: r.top - GAP, transform: 'translate(-50%, -100%)' }
  return { left: r.left + r.width / 2, top: r.bottom + GAP, transform: 'translateX(-50%)' }
}

/**
 * The name of an icon-only control, shown on hover and on keyboard focus (Esc hides it). It is drawn in a portal at the
 * body, so a scrolling or clipping parent (the rail) never cuts it off. The control's own `aria-label` stays its
 * accessible name; the tooltip only repeats it for the eye, so it is hidden from a screen reader.
 */
export function Tooltip({ label, side = 'right', disabled = false, children }: TooltipProps) {
  const [at, setAt] = useState<At | null>(null)

  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [at])

  const show = (e: { currentTarget: Element }) => setAt(place(e.currentTarget, side))
  const hide = () => setAt(null)
  const own = children.props
  return (
    <>
      {cloneElement(children, {
        onMouseEnter: (e: never) => { own.onMouseEnter?.(e); show(e) },
        onMouseLeave: (e: never) => { own.onMouseLeave?.(e); hide() },
        onFocus: (e: FocusEvent) => { own.onFocus?.(e); show(e) },
        onBlur: (e: FocusEvent) => { own.onBlur?.(e); hide() },
      })}
      {at && !disabled && createPortal(
        <span
          data-testid="tooltip"
          aria-hidden
          style={{ left: at.left, top: at.top, transform: at.transform }}
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded-md border border-border bg-surface-1 px-2 py-1 text-small text-text-primary shadow-pop"
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  )
}
