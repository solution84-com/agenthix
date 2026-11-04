import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Where a Files tool is, kept in the address (`?tool=files&file=specs/a.md`), as the Tasks tool keeps its own:
 * a link can carry it, and moving within the tool replaces the entry rather than adding history.
 */
export function useToolParams() {
  const [params, setParams] = useSearchParams()
  const set = useCallback((changes: Record<string, string | null>) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      for (const [name, value] of Object.entries(changes)) {
        if (value) next.set(name, value)
        else next.delete(name)
      }
      return next
    }, { replace: true })
  }, [setParams])
  return { get: (name: string) => params.get(name), set }
}

/** The width from which a tool lays itself out wide: the folders beside the open file, a workspace's facts beside it. */
export const WIDE_TOOL_PX = 640

/**
 * True while the element is at least `WIDE_TOOL_PX` wide; null until it has been measured, which is before the first
 * paint, so a caller that keeps something that must not be remounted (a file's frame) waits for a layout rather than
 * mounting it in the narrow one and moving it. Narrow where it cannot be measured.
 */
export function useWide(ref: RefObject<HTMLElement | null>): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    setWide(el ? el.getBoundingClientRect().width >= WIDE_TOOL_PX : false)
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setWide(entry.contentRect.width >= WIDE_TOOL_PX)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return wide
}
