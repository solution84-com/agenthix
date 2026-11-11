import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { DOCK_WIDTH_STEP, type useDockSize } from './dockSize'

type Size = ReturnType<typeof useDockSize>

/**
 * The drag handle on the dock's inner (left) edge. The dock sits at the right of the window, so its width is the
 * distance from the pointer to the window's right edge. The pointer is captured, so the drag follows it over the
 * page, and the page's text is not selected meanwhile.
 */
export function DockResizeHandle({ size }: { size: Size }) {
  const dragging = useRef(false)
  const lastSelect = useRef('')

  const move = (e: PointerEvent) => {
    if (dragging.current) size.set(window.innerWidth - e.clientX, false)
  }
  const end = (e: PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.userSelect = lastSelect.current
    size.set(window.innerWidth - e.clientX, true)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    // The handle is on the dock's left edge, so a step left makes the dock wider.
    const next = e.key === 'ArrowLeft' ? size.width + DOCK_WIDTH_STEP
      : e.key === 'ArrowRight' ? size.width - DOCK_WIDTH_STEP
      : e.key === 'Home' ? size.min
      : e.key === 'End' ? size.max
      : null
    if (next === null) return
    e.preventDefault()
    size.set(next, true)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the conversation"
      aria-valuenow={size.width}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      tabIndex={0}
      data-testid="dock-resize"
      title="Drag to resize; double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        dragging.current = true
        lastSelect.current = document.body.style.userSelect
        document.body.style.userSelect = 'none'
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={size.reset}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none transition-colors hover:bg-border-strong focus-visible:bg-border-strong focus-visible:outline-none"
    />
  )
}
