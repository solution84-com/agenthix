import { useCallback, useRef, useState } from 'react'

/** Breathing space kept between the last line of a thread and the floating box, in pixels. */
export const ROOM_GAP = 20

/** The room a thread keeps at its end so its last line scrolls clear of the box floating over it. */
export const endSpaceFor = (floatingHeight: number): number => floatingHeight + ROOM_GAP

/**
 * Measures the block floating over the foot of a thread (the box with the live line and strips above it), as it
 * grows and shrinks, so the thread can keep that much room at its end.
 */
export function useFloatingRoom() {
  const [height, setHeight] = useState(0)
  const watch = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    watch.current?.disconnect()
    if (!el) return
    setHeight(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    watch.current = new ResizeObserver(() => setHeight(el.offsetHeight))
    watch.current.observe(el)
  }, [])
  return { ref, height }
}
