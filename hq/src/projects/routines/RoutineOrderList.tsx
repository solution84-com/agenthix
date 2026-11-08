import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core'
import type { RoutineSummary } from '../../shared/routineTypes'
import { CardGrip } from '../workroom/AgentCard'
import type { RoutineMenuItem } from './RoutineMenu'
import { landsWords, movedOrder, moveWhy } from './routineListWords'

/** What the list hands each card while it can be reordered. */
export type CardOrder = { grip: ReactNode; moves: RoutineMenuItem[]; lifted: boolean }

function Draggable({ id, children }: { id: string; children: (grip: ReactNode, style: CSSProperties | undefined, setRef: (el: HTMLElement | null) => void) => ReactNode }) {
  const drag = useDraggable({ id })
  const drop = useDroppable({ id })
  const t = drag.transform
  const style: CSSProperties | undefined = t ? { transform: `translate3d(0, ${t.y}px, 0)`, zIndex: 20, position: 'relative' } : undefined
  const grip = <CardGrip label="Drag to reorder the routines" ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners} />
  return <>{children(grip, style, el => { drag.setNodeRef(el); drop.setNodeRef(el) })}</>
}

function LandsSlot({ text }: { text: string }) {
  return (
    <div aria-hidden className="flex h-14 items-center rounded-xl border-2 border-dashed border-accent bg-accent-subtle px-4 text-small text-accent">
      {text}
    </div>
  )
}

/**
 * A project's routine cards in the order its people gave them (the Routines design keys 12, 13): dragged by the grip
 * on a wide screen, the card lifting and a dashed slot saying where it lands; Move up and Move down in each card's ⋯
 * everywhere, for a phone and the keyboard. A move shows at once; the next answer from hq is the order. Without
 * `onReorder` (a Viewer, or a filtered list) the cards are only listed.
 */
export function RoutineOrderList({ routines, onReorder, card }: {
  routines: RoutineSummary[]
  onReorder?: (ids: string[]) => void
  card: (r: RoutineSummary, order?: CardOrder) => ReactNode
}) {
  const ids = routines.map(r => r.id).join('|')
  const [order, setOrder] = useState(routines.map(r => r.id))
  const [active, setActive] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor))
  useEffect(() => { setOrder(ids ? ids.split('|') : []) }, [ids])
  const byId = new Map(routines.map(r => [r.id, r]))
  const shown = order.flatMap(id => (byId.has(id) ? [byId.get(id)!] : []))

  const move = (from: number, to: number) => {
    if (!onReorder || to < 0 || to >= order.length || from === to) return
    const next = movedOrder(order, from, to)
    setOrder(next)
    onReorder(next)
  }
  const list = (children: ReactNode) => <div role="list" aria-label="Routines" className="flex flex-col gap-2">{children}</div>

  if (!onReorder || shown.length < 2) return list(shown.map(r => <div role="listitem" key={r.id}>{card(r)}</div>))

  const from = active ? order.indexOf(active) : -1
  const to = over && over !== active ? order.indexOf(over) : -1
  const slot = from >= 0 && to >= 0 ? <LandsSlot text={landsWords(byId.get(active!)?.title ?? '', to)} /> : null
  const clear = () => { setActive(null); setOver(null) }
  const onDragEnd = (ev: DragEndEvent) => {
    clear()
    if (!ev.over || ev.over.id === ev.active.id) return
    move(order.indexOf(String(ev.active.id)), order.indexOf(String(ev.over.id)))
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(ev: DragStartEvent) => setActive(String(ev.active.id))}
      onDragOver={(ev: DragOverEvent) => setOver(ev.over ? String(ev.over.id) : null)}
      onDragCancel={clear}
      onDragEnd={onDragEnd}
    >
      {list(shown.map((r, at) => {
        const why = moveWhy(at, shown.length)
        const moves: RoutineMenuItem[] = [
          { label: 'Move up', onSelect: () => move(at, at - 1), disabledWhy: why.up },
          { label: 'Move down', onSelect: () => move(at, at + 1), disabledWhy: why.down },
        ]
        return (
          <div role="listitem" key={r.id} className="flex flex-col gap-2">
            {to === at && to < from && slot}
            <Draggable id={r.id}>
              {(grip, style, setRef) => <div ref={setRef} style={style}>{card(r, { grip, moves, lifted: r.id === active })}</div>}
            </Draggable>
            {to === at && to > from && slot}
          </div>
        )
      }))}
    </DndContext>
  )
}
