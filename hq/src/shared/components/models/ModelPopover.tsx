import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { PICKER_MAX_HEIGHT, pickerPlacement } from './modelPickerLogic'

/** The window's visible rows, narrowed by every ancestor that clips what overflows it. */
function visibleBounds(el: HTMLElement): { top: number; bottom: number } {
  let top = 0
  let bottom = window.innerHeight
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (getComputedStyle(a).overflowY === 'visible') continue
    const r = a.getBoundingClientRect()
    top = Math.max(top, r.top)
    bottom = Math.min(bottom, r.bottom)
  }
  return { top, bottom }
}

/**
 * Where the model list opens: beside what opened it on a wide screen (above or below, whichever has the room), a
 * sheet from the bottom on a phone. A click outside or `close` shuts it and gives focus back to what opened it.
 */
export function ModelPopover({ open, onClose, above = false, trigger, children }: {
  open: boolean
  onClose: () => void
  above?: boolean
  /** What opens the list, given the ref focus goes back to. */
  trigger: (ref: RefObject<HTMLButtonElement | null>) => ReactNode
  /** The list, given the function that shuts it. */
  children: (close: () => void) => ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  const [placement, setPlacement] = useState({ above, maxHeight: PICKER_MAX_HEIGHT })
  const close = () => { onClose(); anchor.current?.focus() }

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    setPlacement(pickerPlacement(anchor.current.getBoundingClientRect(), visibleBounds(anchor.current), above))
  }, [open, above])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  })

  return (
    <div ref={root} className="relative inline-block">
      {trigger(anchor)}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-scrim lg:hidden" aria-hidden onClick={close} />
          <div
            data-testid="model-picker"
            style={{ '--picker-max': `${placement.maxHeight}px` } as React.CSSProperties}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface-1 shadow-pop lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:max-h-(--picker-max) lg:w-96 lg:rounded-xl ${placement.above ? 'lg:bottom-full lg:mb-1' : 'lg:top-full lg:mt-1'}`}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
            {children(close)}
          </div>
        </>
      )}
    </div>
  )
}
