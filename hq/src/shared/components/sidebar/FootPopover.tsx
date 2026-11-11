import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Something that opens from a row in the navigation's foot: upward from the row, attached to it, or — at icon width,
 * where the navigation is too narrow to hold it — to the right of the row's button. Esc and a click outside close it
 * (and give focus back to the button) unless `dismissable` is false: then only the button closes it.
 */
export function FootPopover({ anchor, side, onClose, dismissable = true, className = '', children, ...aria }: {
  anchor: RefObject<HTMLElement | null>
  side: 'top' | 'right'
  onClose: () => void
  dismissable?: boolean
  className?: string
  children: ReactNode
  role?: string
  'aria-label'?: string
  id?: string
  'data-testid'?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null)

  useLayoutEffect(() => {
    if (side !== 'right') return
    const r = anchor.current?.getBoundingClientRect()
    if (r) setAt({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) })
  }, [side, anchor])

  useEffect(() => {
    if (!dismissable) return
    const close = () => { onClose(); anchor.current?.focus() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Ahead of other Esc handlers, so a *Go to* around this stays open.
      e.stopPropagation()
      close()
    }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [dismissable, onClose, anchor])

  const base = 'rounded-xl border border-border bg-popover shadow-pop overflow-y-auto'
  if (side === 'top') {
    return (
      <div ref={box} {...aria} className={`absolute bottom-full inset-x-0 z-10 mb-1 max-h-[50vh] ${base} ${className}`}>
        {children}
      </div>
    )
  }
  if (!at) return null
  return createPortal(
    <div ref={box} {...aria} style={{ left: at.left, bottom: at.bottom }} className={`fixed z-50 w-56 max-h-[50vh] ${base} ${className}`}>
      {children}
    </div>,
    document.body,
  )
}
