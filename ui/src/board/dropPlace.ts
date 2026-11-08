import type { ViewColumnData } from './types'

/** Where a dragged card would land: a column and its place among that column's other cards. */
export interface DropPlace {
  column: string
  /** Its place among the column's cards with the dragged one taken out: 0 is the top. */
  index: number
}

/**
 * The place a card lands when dropped over another card (`overCard`) or a column's empty space: before the card it is
 * over, or after it when the pointer is past that card's middle; at a column's end over its empty space.
 */
export function dropPlaceOf(columns: readonly ViewColumnData[], draggedId: string, over: { column: string; overCard: string | null; below: boolean }): DropPlace | null {
  const column = columns.find(c => c.key === over.column)
  if (!column) return null
  const others = column.cards.filter(c => c.id !== draggedId)
  if (!over.overCard || over.overCard === draggedId) return { column: column.key, index: over.overCard ? indexOf(column, draggedId) : others.length }
  const at = others.findIndex(c => c.id === over.overCard)
  if (at < 0) return { column: column.key, index: others.length }
  return { column: column.key, index: over.below ? at + 1 : at }
}

function indexOf(column: ViewColumnData, id: string): number {
  return Math.max(0, column.cards.findIndex(c => c.id === id))
}

/**
 * What a drop names to the server: the visible card above where it lands, or, at the top, the visible card below it
 * (adr-0176: a drop on a filtered board goes after the visible card above). Null when the card would stay where it is.
 */
export function dropNeighbours(columns: readonly ViewColumnData[], draggedId: string, place: DropPlace): { afterTaskId: string | null; beforeTaskId: string | null } | null {
  const column = columns.find(c => c.key === place.column)
  if (!column) return null
  const from = columns.find(c => c.cards.some(card => card.id === draggedId))
  if (from?.key === place.column && indexOf(column, draggedId) === place.index) return null
  const others = column.cards.filter(c => c.id !== draggedId)
  const above = place.index > 0 ? others[place.index - 1] : undefined
  if (above) return { afterTaskId: above.id, beforeTaskId: null }
  return { afterTaskId: null, beforeTaskId: others[0]?.id ?? null }
}

/** "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}
