import { useEffect, useState, type RefObject } from 'react'

/** The narrowest a card is drawn, and the gap between cards (px). The grid below is written with the same numbers. */
export const CARD_MIN = 280
export const CARD_GAP = 16
/** Columns assumed when the grid has no width to measure yet. */
const UNMEASURED = 3

export const columnsFor = (width: number) => (width > 0 ? Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN + CARD_GAP))) : UNMEASURED)

/** How many cards fit in one row of the grid at the width it has now: a shelf shows one row's worth. */
export function useGridColumns(ref: RefObject<HTMLElement | null>): number {
  const [columns, setColumns] = useState(UNMEASURED)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => setColumns(columnsFor(el.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return columns
}
