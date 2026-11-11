import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Measures the block floating over the foot of a thread (the box with the live line and strips above it), as it
 * grows and shrinks, so the thread can keep room at its end and hold the line being read above it. `element` gives
 * the block itself, so the thread can measure where it actually is. While a thread is open, a toast is lifted above
 * the block (`--toast-offset`, which the frame's `ToastHost` reads), so it never covers the message box, and centred
 * over the block's column (`--toast-left`, `--toast-right`), so a docked conversation's toast is not centred on the
 * whole window over the page beside it.
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
  useEffect(() => {
    if (height <= 0) return
    const root = document.documentElement
    const place = () => {
      const rect = node.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) return
      root.style.setProperty('--toast-left', `${rect.left}px`)
      root.style.setProperty('--toast-right', `${Math.max(0, root.clientWidth - rect.right)}px`)
    }
    root.style.setProperty('--toast-offset', `${height}px`)
    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
      for (const v of ['--toast-offset', '--toast-left', '--toast-right']) root.style.removeProperty(v)
    }
  }, [height])
  return { ref, height, element }
}
