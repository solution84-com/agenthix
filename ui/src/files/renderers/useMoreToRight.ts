import { useCallback, useEffect, useRef, useState } from 'react'

/** Whether a sideways-scrolling element has more of itself to the right of what shows; follows scrolling and resizing. */
export function useMoreToRight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [more, setMore] = useState(false)
  const check = useCallback(() => {
    const el = ref.current
    setMore(!!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    check()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check)
    observer?.observe(el)
    return () => observer?.disconnect()
  })
  return { ref, more, onScroll: check }
}
