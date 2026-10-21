import type { ReactNode } from 'react'
import type { OverflowItem } from '../tasks/OverflowMenu'
import type { BoardCardData, BoardColumnInfo, BoardLayout, ShowAlsoGroup } from './types'
import type { ShowAlsoPicker } from './ShowAlso'

export const BACKLOG_ID = '__backlog__'

export interface ColumnsViewProps {
  layout: BoardLayout
  boardId: string
  columns: BoardColumnInfo[]
  /** The tasks in the board's columns. */
  cards: BoardCardData[]
  /** The board's own Backlog. */
  backlog: BoardCardData[]
  /** Other boards' backlogs the person chose to show with this Backlog. */
  showAlso: ShowAlsoGroup[]
  /** The Show also ▾ control, drawn in the Backlog's heading. */
  /** The Backlog menu's "Show also…"; absent where there is nothing to choose. */
  showAlsoPicker?: ShowAlsoPicker
  /** What the Backlog holds, beside its count ("not in a sprint"). */
  backlogNote?: string
  now: Date
  onOpen: (card: BoardCardData) => void
  /** A card dropped into a column, or into the Backlog (null). Absent: cards stay where they are. */
  onMove?: (card: BoardCardData, column: string | null) => void
  /** The ⋯ of a card; the place it is in tells which of the board's own it is. */
  menuFor: (card: BoardCardData, from: ShowAlsoGroup | null) => OverflowItem[]
  /** Switch a column's "starts work". Absent: it cannot be switched here. */
  onToggleStarts?: (columnName: string) => void
  startsDisabledReason?: string
  /** Whether the Backlog is folded away, and the switch for it; set by `BoardColumnsView`, which remembers the choice. */
  backlogFold?: { folded: boolean; toggle: () => void }
  linkRoutine?: (routineId: string, children: ReactNode) => ReactNode
  /** Wraps a card's agent picture so a click opens the agent's profile card. */
  linkAgent?: (agentId: string, children: ReactNode) => ReactNode
}

/** One place on a board where tasks sit: the Backlog or a column. */
export interface Place {
  id: string
  /** The column's name; null for the Backlog. */
  column: string | null
  label: string
  status: string
  autoQueue: boolean
  cards: BoardCardData[]
  note?: string
}

export function placesOf(p: Pick<ColumnsViewProps, 'columns' | 'cards' | 'backlog' | 'backlogNote'>): Place[] {
  const sorted = [...p.columns].sort((a, b) => a.order - b.order)
  return [
    { id: BACKLOG_ID, column: null, label: 'Backlog', status: 'TODO', autoQueue: false, cards: p.backlog, note: p.backlogNote },
    ...sorted.map(c => ({
      id: c.name, column: c.name, label: c.label, status: c.status, autoQueue: !!c.autoQueue,
      cards: p.cards.filter(t => t.column === c.name),
    })),
  ]
}
