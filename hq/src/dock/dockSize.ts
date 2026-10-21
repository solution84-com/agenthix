import { useCallback, useEffect, useState } from 'react'

export const DOCK_DEFAULT_WIDTH = 400
export const DOCK_MAX_WIDTH = 720
export const DOCK_WIDTH_STEP = 24
const KEY = 'dock-width'

/** At least the default width; at most the smaller of half the window and a fixed maximum, so the canvas stays usable. */
export function dockWidthLimits(windowWidth: number): { min: number; max: number } {
  const max = Math.max(DOCK_DEFAULT_WIDTH, Math.min(DOCK_MAX_WIDTH, Math.floor(windowWidth / 2)))
  return { min: DOCK_DEFAULT_WIDTH, max }
}

function read(): number | null {
  try {
    const value = Number(localStorage.getItem(KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

function write(width: number) {
  try { localStorage.setItem(KEY, String(width)) } catch { /* storage blocked: the width lasts until reload */ }
}

const windowWidth = () => (typeof window === 'undefined' ? 1280 : window.innerWidth)

/**
 * The dock's width, remembered in this browser. What is stored is what the person chose; a window too small for it
 * only clamps what is shown, so the width returns when the window grows again.
 */
export function useDockSize() {
  const [chosen, setChosen] = useState<number | null>(read)
  const [viewport, setViewport] = useState(windowWidth)
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const { min, max } = dockWidthLimits(viewport)
  const width = Math.min(max, Math.max(min, Math.round(chosen ?? DOCK_DEFAULT_WIDTH)))

  /** Follows a drag or a key press; `save` writes it when the drag ends. */
  const set = useCallback((next: number, save: boolean) => {
    const limits = dockWidthLimits(windowWidth())
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(next)))
    setChosen(clamped)
    if (save) write(clamped)
  }, [])
  const reset = useCallback(() => set(DOCK_DEFAULT_WIDTH, true), [set])
  return { width, min, max, set, reset }
}
