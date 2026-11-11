import { useCallback, useRef, useState } from 'react'

/**
 * Measures the block floating over the foot of a thread (the box with the live line and strips above it), as it
 * grows and shrinks, so the thread can keep room at its end and hold the line being read above it. `element` gives
 * the block itself, so the thread can measure where it actually is.
 */
export function useFloatingRoom() {
  const [height, setHeight] = useState(0)
  const watch = useRef<ResizeObserver | null>(null)
  const node = useRef<HTMLElement | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    watch.current?.disconnect()
    node.current = el
    if (!el) return
    setHeight(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    watch.current = new ResizeObserver(() => setHeight(el.offsetHeight))
    watch.current.observe(el)
  }, [])
  const element = useCallback(() => node.current, [])
  return { ref, height, element }
}
