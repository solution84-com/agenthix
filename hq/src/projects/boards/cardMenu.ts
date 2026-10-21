import type { OverflowItem } from '@agenthix/ui/tasks'
import type { BoardCardData, BoardColumnInfo, ShowAlsoGroup } from '@agenthix/ui/board'

export interface CardMenuContext {
  /** The board the cards are drawn on. */
  boardId: string
  columns: Pick<BoardColumnInfo, 'name' | 'label'>[]
  /** The project's other boards a task may move to. */
  otherBoards: { id: string; name: string }[]
  canChange: boolean
  /** Into one of this board's columns, or its Backlog (null). */
  moveToColumn: (card: BoardCardData, column: string | null) => Promise<void>
  /** Onto another board, landing in its Backlog. */
  moveToBoard: (card: BoardCardData, boardId: string) => Promise<void>
}

/**
 * The ⋯ of a card (every screen reviewed spec §3): move it to another column, or to another board, where it lands
 * in that board's Backlog. A task from another board's Backlog, shown here by Show also, can be moved here.
 * Nothing a viewer may not do is offered.
 */
export function cardMenuItems(card: BoardCardData, from: ShowAlsoGroup | null, ctx: CardMenuContext): OverflowItem[] {
  if (!ctx.canChange) return []
  if (from) return [{ label: 'Move here', onSelect: () => ctx.moveToBoard(card, ctx.boardId) }]
  const places = [{ name: null as string | null, label: 'Backlog' }, ...ctx.columns]
  return [
    ...places.filter(p => p.name !== card.column).map(p => ({ label: `Move to ${p.label}`, onSelect: () => ctx.moveToColumn(card, p.name) })),
    ...ctx.otherBoards.map(b => ({ label: `Move to board: ${b.name}`, onSelect: () => ctx.moveToBoard(card, b.id) })),
  ]
}
