import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { OverflowMenu } from '@agenthix/ui/tasks'
import { useIsMobile } from '../../shared/hooks/useIsMobile'
import { AgentCard, CardGrip, type CardControls } from './AgentCard'
import type { WorkroomAgent } from './workroomTypes'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'

export type CardEntry = {
  key: string
  agent: WorkroomAgent
  controls: CardControls
  quiet: string | null
  /** On Workrooms on a phone, the project under the name. */
  place?: { name: string; href: string }
  /** The pager's words after the name: "1 of 5", "Website relaunch · 1 of 6". */
  where?: string
}

const PAGER_BUTTON = `inline-flex h-11 w-11 items-center justify-center rounded-lg ${BUTTON_SECONDARY}`

function Draggable({ id, children }: { id: string; children: (grip: ReactNode, style: CSSProperties | undefined, setRef: (el: HTMLElement | null) => void, over: boolean) => ReactNode }) {
  const drag = useDraggable({ id })
  const drop = useDroppable({ id })
  const t = drag.transform
  const style: CSSProperties | undefined = t ? { transform: `translate3d(0, ${t.y}px, 0)`, zIndex: 20, position: 'relative', opacity: 0.85 } : undefined
  const grip = <CardGrip label="Drag to reorder the agents" ref={drag.setActivatorNodeRef} {...drag.attributes} {...drag.listeners} />
  return <>{children(grip, style, (el) => { drag.setNodeRef(el); drop.setNodeRef(el) }, drop.isOver && !drag.isDragging)}</>
}

function moved(order: string[], from: number, to: number): string[] {
  const next = [...order]
  const [id] = next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/**
 * A Workroom's agent cards. Wide, one under another, dragged by their handle to reorder the agents (kept for the
 * project); on a phone, one agent per screen with ‹ › between them, the order set from each card's ⋯ (Move up, Move
 * down), since a phone has no drag.
 */
export function AgentCards({ entries, now, onReorder }: {
  entries: CardEntry[]
  now: Date
  /** Given to someone who may change the order: the agents' ids in their new order. */
  onReorder?: (keys: string[]) => void
}) {
  const phone = useIsMobile()
  const [order, setOrder] = useState(entries.map(e => e.key))
  const [index, setIndex] = useState(0)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor))
  const keys = entries.map(e => e.key).join('|')
  // A move shows at once; the next answer from hq is the order.
  useEffect(() => { setOrder(keys ? keys.split('|') : []) }, [keys])
  const byKey = new Map(entries.map(e => [e.key, e]))
  const shown = order.flatMap(k => (byKey.has(k) ? [byKey.get(k)!] : []))
  const move = (from: number, to: number) => {
    if (!onReorder || to < 0 || to >= order.length) return
    const next = moved(order, from, to)
    setOrder(next)
    onReorder(next)
  }

  if (phone) {
    const at = Math.min(index, shown.length - 1)
    const e = shown[at]
    if (!e) return null
    return (
      <div>
        <div className="flex items-center gap-2 py-3">
          <button type="button" aria-label="Previous agent" disabled={at === 0} onClick={() => setIndex(at - 1)} className={PAGER_BUTTON}><ChevronLeft size={18} aria-hidden /></button>
          <span className="min-w-0 flex-1 truncate text-center text-small text-text-secondary">
            <b className="font-medium text-text-primary">{e.agent.name}</b> · {e.where ? `${e.where} · ` : ''}{at + 1} of {shown.length}
          </span>
          <button type="button" aria-label="Next agent" disabled={at === shown.length - 1} onClick={() => setIndex(at + 1)} className={PAGER_BUTTON}><ChevronRight size={18} aria-hidden /></button>
        </div>
        <AgentCard
          agent={e.agent} now={now} controls={e.controls} quiet={e.quiet} place={e.place} short
          more={onReorder && shown.length > 1 ? (
            <OverflowMenu
              label={`${e.agent.name}: more`}
              items={[
                { label: 'Move up', onSelect: () => { move(at, at - 1); setIndex(at - 1) }, disabledReason: at === 0 ? 'It is first already' : undefined },
                { label: 'Move down', onSelect: () => { move(at, at + 1); setIndex(at + 1) }, disabledReason: at === shown.length - 1 ? 'It is last already' : undefined },
              ]}
            />
          ) : undefined}
        />
      </div>
    )
  }

  if (!onReorder || shown.length < 2) {
    return <div>{shown.map(e => <AgentCard key={e.key} agent={e.agent} now={now} controls={e.controls} quiet={e.quiet} />)}</div>
  }
  const onDragEnd = (ev: DragEndEvent) => {
    if (!ev.over || ev.over.id === ev.active.id) return
    move(order.indexOf(String(ev.active.id)), order.indexOf(String(ev.over.id)))
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {shown.map(e => (
        <Draggable key={e.key} id={e.key}>
          {(grip, style, setRef, over) => (
            <div ref={setRef} style={style} className={over ? 'rounded-xl ring-2 ring-text-muted' : undefined}>
              <AgentCard agent={e.agent} now={now} controls={e.controls} quiet={e.quiet} grip={grip} />
            </div>
          )}
        </Draggable>
      ))}
    </DndContext>
  )
}
