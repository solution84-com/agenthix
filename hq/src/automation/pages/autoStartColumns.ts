import { columnsOf } from './boardColumns'

export type AutoStartBoard = { boardId: string; name: string; columns: string[] }

/**
 * The Rules view's "Columns that start work automatically" (every screen
 * reviewed spec §3): only the columns switched on, grouped by board. The switch
 * itself stays on the board's column.
 */
export function autoStartColumns(boards: Array<{ id: string; name: string; archivedAt?: string | Date | null; columns: unknown }>): AutoStartBoard[] {
  return boards
    .filter(b => !b.archivedAt)
    .map(b => ({
      boardId: b.id,
      name: b.name,
      columns: columnsOf(b.columns).filter(s => s.autoQueue).map(s => s.label ?? s.name),
    }))
    .filter(b => b.columns.length > 0)
}
