import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The width of an element, kept up with as the panel is resized; `fallback` where nothing can be measured.
 * `ref` is a callback ref, so an element that mounts after the first render (behind a loading state) is
 * still measured.
 */
export function useElementWidth<T extends HTMLElement>(fallback: number) {
  const [width, setWidth] = useState(fallback)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const read = () => { if (el.clientWidth > 0) setWidth(el.clientWidth) }
    read()
    observer.current = new ResizeObserver(read)
    observer.current.observe(el)
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return { ref, width }
}
