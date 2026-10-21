import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { daysMoved, type TimelineView } from './layout'

/** Pointer moves under this many pixels are a click, not a drag. */
const CLICK_SLOP_PX = 3

export interface DragState<M extends string> { mode: M; days: number }

/**
 * Dragging along a timeline track in whole days. A press that hardly moves is a
 * click (`onClick`); a drag reports its mode and days once, on release.
 */
export function useBarDrag<M extends string>(opts: {
  trackRef: RefObject<HTMLElement | null>
  view: TimelineView
  enabled: (mode: M) => boolean
  onCommit: (mode: M, days: number) => void
  onClick: () => void
}) {
  const [drag, setDrag] = useState<DragState<M> | null>(null)
  const justDragged = useRef(false)

  const begin = (mode: M) => (e: PointerEvent) => {
    if (e.button) return
    if (!opts.enabled(mode)) return
    e.stopPropagation()
    const x0 = e.clientX
    const width = opts.trackRef.current?.getBoundingClientRect().width ?? 0
    let moved = false
    let days = 0
    const move = (ev: globalThis.PointerEvent | MouseEvent) => {
      const dx = ev.clientX - x0
      if (Math.abs(dx) > CLICK_SLOP_PX) moved = true
      days = daysMoved(opts.view, dx, width)
      if (moved) setDrag({ mode, days })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      if (moved) {
        justDragged.current = true
        setTimeout(() => { justDragged.current = false }, 0)
        if (days !== 0) opts.onCommit(mode, days)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return {
    drag,
    begin,
    /** For the bar itself: opens it, unless the press was a drag. */
    onClick: () => { if (!justDragged.current) opts.onClick() },
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick() } },
  }
}
