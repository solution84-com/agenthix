import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { BoardCardView } from './BoardCardView'
import { ColumnHeader } from './ColumnHeader'
import { BACKLOG_ID, placesOf, type ColumnsViewProps } from './columnsModel'
import type { BoardCardData, ShowAlsoGroup } from './types'

function DraggableCard({ card, p, from }: { card: BoardCardData; p: ColumnsViewProps; from: ShowAlsoGroup | null }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !p.onMove || card.runState === 'RUN_ACTIVE' })
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className={isDragging ? 'opacity-50' : ''}
    >
      <BoardCardView card={card} variant="card" now={p.now} from={from?.boardName} onOpen={() => p.onOpen(card)} menu={p.menuFor(card, from)} linkRoutine={p.linkRoutine} linkAgent={p.linkAgent} />
    </div>
  )
}

function Droppable({ id, narrow, children }: { id: string; narrow?: boolean; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`flex shrink-0 flex-col gap-2 rounded-xl p-2 ${narrow ? 'w-10 items-center' : 'w-64'} ${isOver ? 'bg-accent/10 ring-1 ring-accent' : 'bg-surface-2'}`}>
      {children}
    </div>
  )
}

/** With room: the columns side by side, a card dragged from one to another. */
export function KanbanColumns(p: ColumnsViewProps) {
  const [dragging, setDragging] = useState<BoardCardData | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const everyCard = [...p.backlog, ...p.cards, ...p.showAlso.flatMap(g => g.tasks)]

  const onEnd = (e: DragEndEvent) => {
    setDragging(null)
    const card = everyCard.find(c => c.id === e.active.id)
    if (!card || !e.over || !p.onMove) return
    const target = e.over.id === BACKLOG_ID ? null : String(e.over.id)
    // Dropped where it already is: nothing to do.
    if (card.boardId === p.boardId && card.column === target) return
    p.onMove(card, target)
  }

  return (
    <DndContext sensors={sensors} onDragStart={e => setDragging(everyCard.find(c => c.id === e.active.id) ?? null)} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
      <div className="flex gap-3 overflow-x-auto px-4 pb-3 pt-3">
        {placesOf(p).map(place => {
          const isBacklog = place.id === BACKLOG_ID
          if (isBacklog && p.backlogFold?.folded) {
            return (
              <Droppable key={place.id} id={place.id} narrow>
                <button
                  type="button" aria-expanded={false} aria-label={`Show the Backlog, ${place.cards.length} tasks`} onClick={p.backlogFold.toggle}
                  className="flex items-center gap-1 py-1 text-small font-medium text-text-secondary hover:text-text-primary [writing-mode:vertical-rl]"
                >
                  Backlog <span className="text-text-muted">{place.cards.length}</span>
                </button>
              </Droppable>
            )
          }
          return (
            <Droppable key={place.id} id={place.id}>
              <section aria-label={place.label} className="space-y-2">
                <ColumnHeader
                  column={place} count={place.cards.length} note={place.note}
                  onToggleStarts={!isBacklog && p.onToggleStarts ? () => p.onToggleStarts?.(place.id) : undefined}
                  startsDisabledReason={p.startsDisabledReason}
                  items={isBacklog && p.backlogFold ? [{ label: 'Hide the Backlog', onSelect: p.backlogFold.toggle }] : []}
                  showAlso={isBacklog ? p.showAlsoPicker : undefined}
                />
                {place.cards.map(card => <DraggableCard key={card.id} card={card} p={p} from={null} />)}
                {isBacklog && p.showAlso.map(g => (
                  <div key={g.boardId} role="group" aria-label={`From ${g.boardName}`} className="space-y-2">
                    <h5 className="pt-2 text-micro font-medium uppercase tracking-wide text-text-muted">From {g.boardName} · {g.tasks.length}</h5>
                    {g.tasks.map(card => <DraggableCard key={card.id} card={card} p={p} from={g} />)}
                  </div>
                ))}
                {place.cards.length === 0 && !(isBacklog && p.showAlso.length > 0) && <p className="py-2 text-center text-micro text-text-muted">No tasks</p>}
              </section>
            </Droppable>
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging && (
          <div className="w-60 rotate-2 shadow-lg">
            <BoardCardView card={dragging} variant="card" now={p.now} onOpen={() => {}} menu={[]} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

