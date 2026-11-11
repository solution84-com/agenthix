import { useRef, useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { ChevronRight } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { BoardMenu, type BoardMenuItem } from './CardMenu'
import { ViewCard } from './ViewCard'
import { dropNeighbours, dropPlaceOf, type DropPlace } from './dropPlace'
import type { CardDrop, ViewCardData, ViewColumnData } from './types'

export interface ViewColumnsProps {
  columns: ViewColumnData[]
  showType: boolean
  /** Why a card is not dragged on this board (the execution board), said where a person tries; null where it is. */
  readOnlyWhy: string | null
  onOpen: (card: ViewCardData) => void
  menuFor: (card: ViewCardData) => BoardMenuItem[]
  columnMenu: (column: ViewColumnData) => BoardMenuItem[]
  onDrop: (drop: CardDrop) => void
  /** The slot's words where a dragged card would land: "Drops here · Triaged, 2nd". */
  slotWords: (card: ViewCardData, place: DropPlace) => string
  /** The columns drawn folded to a strip; a click opens one. */
  folded: ReadonlySet<string>
  onUnfold: (key: string) => void
  /** Drawn faded, so the field's own columns lead (a field board's No value). */
  faded?: ReadonlySet<string>
  /** "No bug here". */
  emptyWords: string
  /** Narrower columns, so a board of six fits more of them (the execution board). */
  narrow?: boolean
}

const cardId = (id: string) => `card:${id}`
const columnId = (key: string) => `column:${key}`

function DraggableCard({ card, p, ghost }: { card: ViewCardData; p: ViewColumnsProps; ghost: boolean }) {
  const drag = useDraggable({ id: card.id, disabled: !!p.readOnlyWhy })
  const drop = useDroppable({ id: cardId(card.id), data: { column: null, card: card.id } })
  const [hint, setHint] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // On a board that is not dragged, pressing to drag says why under the card, not as a message in the page.
  const press = p.readOnlyWhy ? {
    onPointerDown: () => { timer.current = setTimeout(() => setHint(true), 300) },
    onPointerUp: () => { if (timer.current) clearTimeout(timer.current); setHint(false) },
    onPointerLeave: () => { if (timer.current) clearTimeout(timer.current); setHint(false) },
  } : {}
  return (
    <div
      ref={node => { drag.setNodeRef(node); drop.setNodeRef(node) }}
      {...drag.attributes} {...drag.listeners} {...press}
      role={undefined} tabIndex={undefined}
      className={`relative ${ghost ? 'opacity-50' : ''}`}
    >
      <ViewCard card={card} showType={p.showType} onOpen={() => p.onOpen(card)} menu={p.menuFor(card)} />
      {hint && p.readOnlyWhy && (
        <span role="tooltip" className="absolute inset-x-0 top-full z-20 mt-1.5 rounded-md border border-border bg-popover px-2 py-1 text-small text-text-primary shadow-pop">
          {p.readOnlyWhy}
        </span>
      )}
    </div>
  )
}

function Column({ column, p, children }: { column: ViewColumnData; p: ViewColumnsProps; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId(column.key), data: { column: column.key, card: null } })
  const faded = p.faded?.has(column.key)
  return (
    <section
      ref={setNodeRef} aria-label={column.name}
      className={`flex shrink-0 flex-col gap-2 rounded-xl p-2 ${p.narrow ? 'w-50' : 'w-64'} ${isOver && !p.readOnlyWhy ? 'bg-selected ring-1 ring-inset ring-border-strong' : 'bg-surface-2'}`}
    >
      <div className={`flex min-h-7 items-center gap-2 whitespace-nowrap text-small font-medium text-text-secondary ${faded ? 'opacity-70' : ''}`}>
        <span className="truncate">{column.name}</span>
        <span className="text-text-muted">{column.count}</span>
        <BoardMenu heading={column.name} items={p.columnMenu(column)} label={`${column.name} column menu`} className="ml-auto" />
      </div>
      <div className={`flex flex-col gap-2 ${faded ? 'opacity-70' : ''}`}>{children}</div>
    </section>
  )
}

/** A finishing column, folded to a strip; a click opens it as a full column. */
function Strip({ column, onOpen }: { column: ViewColumnData; onOpen: () => void }) {
  return (
    <button
      type="button" aria-label={`Show ${column.name}, ${column.count} tasks`} onClick={onOpen}
      className={`flex w-10 shrink-0 flex-col items-center gap-1.5 rounded-xl bg-surface-2 py-3 text-small font-medium text-text-secondary hover:bg-surface-hover ${FOCUS_RING}`}
    >
      <ChevronRight size={16} aria-hidden />
      <span className="inline-flex gap-1.5 [writing-mode:vertical-rl]">{column.name} <span className="text-text-muted">{column.count}</span></span>
    </button>
  )
}

/**
 * A board's columns side by side (B1, B2): each card in rank order. Dragging a card to another column sets what the
 * board is grouped by; dragging it up or down sets its rank (D14). A dashed slot says where it lands before it is let
 * go. The board scrolls sideways under a fade at its right edge.
 */
export function ViewColumns(p: ViewColumnsProps) {
  const [dragging, setDragging] = useState<ViewCardData | null>(null)
  const [place, setPlace] = useState<DropPlace | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const cards = p.columns.flatMap(c => c.cards)

  const placeOf = (e: DragOverEvent | DragEndEvent): DropPlace | null => {
    if (!e.over) return null
    const data = e.over.data.current as { column: string | null; card: string | null } | undefined
    const overCard = data?.card ?? null
    const column = data?.column ?? p.columns.find(c => c.cards.some(card => card.id === overCard))?.key
    if (!column) return null
    const pointer = e.active.rect.current.translated
    const below = !!pointer && pointer.top + pointer.height / 2 > e.over.rect.top + e.over.rect.height / 2
    return dropPlaceOf(p.columns, String(e.active.id), { column, overCard, below })
  }

  const end = (e: DragEndEvent) => {
    const card = cards.find(c => c.id === e.active.id)
    const at = placeOf(e)
    setDragging(null)
    setPlace(null)
    if (!card || !at) return
    const neighbours = dropNeighbours(p.columns, card.id, at)
    if (neighbours) p.onDrop({ card, column: at.column, ...neighbours })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => setDragging(cards.find(c => c.id === e.active.id) ?? null)}
      onDragOver={e => setPlace(placeOf(e))}
      onDragEnd={end}
      onDragCancel={() => { setDragging(null); setPlace(null) }}
    >
      <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto px-6 py-4 [mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]">
        {p.columns.map(column => {
          if (p.folded.has(column.key)) return <Strip key={column.key} column={column} onOpen={() => p.onUnfold(column.key)} />
          // The slot's place counts the column's other cards; the dragged card stays where it was, faded, until let go.
          const slotAt = dragging && place?.column === column.key ? place.index : -1
          const slot = slotAt >= 0 ? <Slot key="slot" words={p.slotWords(dragging!, place!)} /> : null
          const items: ReactNode[] = []
          let other = 0
          for (const card of column.cards) {
            const isDragged = card.id === dragging?.id
            if (!isDragged && other === slotAt) items.push(slot)
            items.push(<DraggableCard key={card.id} card={card} p={p} ghost={isDragged} />)
            if (!isDragged) other++
          }
          if (slotAt >= other) items.push(slot)
          return (
            <Column key={column.key} column={column} p={p}>
              {items}
              {column.cards.length === 0 && slotAt < 0 && <p className="py-2 text-center text-micro text-text-muted">{p.emptyWords}</p>}
            </Column>
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && <div className="w-60"><ViewCard card={dragging} showType={p.showType} onOpen={() => {}} menu={[]} lifted /></div>}
      </DragOverlay>
    </DndContext>
  )
}

function Slot({ words }: { words: string }) {
  return (
    <div data-testid="drop-slot" className="rounded-xl border-[1.5px] border-dashed border-border-strong bg-selected px-2 py-3 text-micro font-medium text-text-secondary">
      {words}
    </div>
  )
}
