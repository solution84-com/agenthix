import { useRef, useState } from 'react'
import { FOCUS_RING, SCROLL_EDGE_FADE } from '../primitives/controlStyles'
import { BoardMenu, type BoardMenuItem } from './CardMenu'
import { CardAssignee, CardKeyLine } from './ViewCard'
import type { ViewCardData, ViewColumnData } from './types'

const LONG_PRESS_MS = 500
const SWIPE_PX = 50

/** A row of a phone's column: the key line, the title, and under them the assignee when it has one. A long press opens its actions. */
function PhoneRow({ card, showType, held, onOpen, onHold }: {
  card: ViewCardData
  showType: boolean
  held: boolean
  onOpen: () => void
  onHold: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef(false)
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  return (
    <li>
      <button
        type="button" aria-label={`Open ${card.key}: ${card.title}`}
        onPointerDown={() => { pressed.current = false; timer.current = setTimeout(() => { pressed.current = true; onHold() }, LONG_PRESS_MS) }}
        onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={e => { e.preventDefault(); stop(); onHold() }}
        onClick={() => { if (!pressed.current) onOpen() }}
        className={`flex w-full flex-col gap-1.5 border-b border-border-subtle px-3 py-2.5 text-left ${held ? 'bg-selected' : 'hover:bg-surface-hover'} ${FOCUS_RING}`}
      >
        <CardKeyLine card={card} showType={showType} />
        <span className="line-clamp-2 text-body text-text-primary">{card.title}</span>
        {card.agent && <span className="flex items-center"><CardAssignee card={card} /></span>}
      </button>
    </li>
  )
}

/**
 * A board on a phone: one column at a time. The column chips stay at the top, each with its count, then the column's
 * name, count and ⋯ above its rows, and a swipe goes to the next or previous column. No drag: a long press on a row
 * opens its actions (Move to ›, Move up, Move down).
 */
export function PhoneColumns({ columns, current, onColumn, showType, held, onOpen, onHold, emptyWords, columnMenu }: {
  columns: ViewColumnData[]
  current: string
  onColumn: (key: string) => void
  showType: boolean
  /** The row whose actions are open. */
  held: string | null
  onOpen: (card: ViewCardData) => void
  onHold: (card: ViewCardData) => void
  emptyWords: string
  /** The column's ⋯, as each column has it on a wide screen. */
  columnMenu?: (column: ViewColumnData) => BoardMenuItem[]
}) {
  const at = Math.max(0, columns.findIndex(c => c.key === current))
  const column = columns[at]
  const [startX, setStartX] = useState<number | null>(null)
  if (!column) return null
  const prev = columns[at - 1]
  const next = columns[at + 1]
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label="Columns" className={`flex gap-1.5 overflow-x-auto px-3 py-2 ${SCROLL_EDGE_FADE}`}>
        {columns.map(c => (
          <button
            key={c.key} type="button" role="tab" aria-selected={c.key === column.key} onClick={() => onColumn(c.key)}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 text-small ${FOCUS_RING} ${
              c.key === column.key ? 'border-accent bg-accent-subtle text-accent' : 'border-border text-text-secondary'}`}
          >
            {c.name} {c.count}
          </button>
        ))}
      </div>
      <div
        role="tabpanel" aria-label={column.name} className="min-h-0 flex-1 overflow-y-auto"
        onTouchStart={e => setStartX(e.touches[0]?.clientX ?? null)}
        onTouchEnd={e => {
          const endX = e.changedTouches[0]?.clientX
          if (startX === null || endX === undefined) return
          if (endX - startX > SWIPE_PX && prev) onColumn(prev.key)
          if (startX - endX > SWIPE_PX && next) onColumn(next.key)
          setStartX(null)
        }}
      >
        <div data-testid="phone-column-heading" className="flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-small font-medium text-text-secondary">
          <span className="truncate">{column.name}</span>
          <span className="text-text-muted">{column.count}</span>
          {columnMenu && <BoardMenu heading={column.name} items={columnMenu(column)} label={`${column.name} column menu`} className="ml-auto" tap />}
        </div>
        {column.cards.length === 0
          ? <p className="px-3 py-4 text-center text-small text-text-muted">{emptyWords}</p>
          : (
            <ul className="border-t border-border-subtle">
              {column.cards.map(card => (
                <PhoneRow key={card.id} card={card} showType={showType} held={held === card.id} onOpen={() => onOpen(card)} onHold={() => onHold(card)} />
              ))}
            </ul>
          )}
        {(prev || next) && (
          <p className="p-3 text-center text-micro text-text-muted">
            {[prev && `‹ ${prev.name}`, 'swipe', next && `${next.name} ›`].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}
