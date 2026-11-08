import { Fragment, useState, type DragEvent, type ReactNode } from 'react'
import { DropSlot, PLAN_DRAG_TYPE, PlanRow, type RowAction } from './PlanRow'
import type { SprintCard } from './SprintTaskBits'

export type Dragged = { id: string; from: 'left' | 'sprint' } | null

export type ListGroup = { heading: string | null; rows: SprintCard[] }

/**
 * One of Plan Sprint's two lists (the design's keys 1, 2 and 11): a card whose header stays put while its rows scroll
 * on their own, so a long Backlog scrolls without moving the sprint. Rows are dragged within it and to the other list;
 * while one is dragged over it, the dashed slot shows where it lands. `groups` holds the rows under their headings
 * (Group by epic); a drop lands by its place among every row shown.
 */
export function PlanList({ side, label, header, groups, foot, empty, mayChange, dragged, onDrag, slotText, onDrop, actionsOf }: {
  side: 'left' | 'sprint'
  label: string
  header: ReactNode
  groups: ListGroup[]
  foot?: ReactNode
  empty: ReactNode
  mayChange: boolean
  dragged: Dragged
  onDrag: (dragged: Dragged) => void
  /** The slot's words for a drop at `index`, or null for no slot (a drop that moves nothing). */
  slotText: (index: number) => string | null
  onDrop: (taskId: string, index: number) => void
  actionsOf: (task: SprintCard, index: number) => RowAction[]
}) {
  const [over, setOver] = useState<number | null>(null)
  const rows = groups.flatMap(g => g.rows)
  const accepts = (e: DragEvent) => mayChange && (!!dragged || e.dataTransfer.types.includes(PLAN_DRAG_TYPE))
  const drop = (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData(PLAN_DRAG_TYPE) || dragged?.id
    const at = over ?? rows.length
    setOver(null)
    onDrag(null)
    if (id) onDrop(id, at)
  }
  const slot = over !== null ? slotText(over) : null
  let index = 0

  return (
    <section
      aria-label={label}
      className="flex min-h-0 flex-col rounded-xl border border-border bg-card"
      onDragOver={e => { if (accepts(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null) }}
      onDrop={drop}
    >
      <div className="shrink-0 border-b border-border-subtle px-4 py-3 max-lg:px-3">{header}</div>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-3 [scrollbar-gutter:stable] max-lg:px-0"
        onDragOver={e => { if (accepts(e) && e.target === e.currentTarget) setOver(rows.length) }}
      >
        {rows.length === 0 && !slot ? <div className="py-3">{empty}</div> : (
          <ul aria-label={label}>
            {groups.map((g, gi) => (
              <Fragment key={g.heading ?? `none-${gi}`}>
                {g.heading && <li className="px-1 pb-1 pt-3 text-micro font-medium text-text-muted">{g.heading}</li>}
                {g.rows.map(t => {
                  const at = index++
                  return (
                    <Fragment key={t.id}>
                      {slot && over === at && <DropSlot text={slot} />}
                      <PlanRow
                        task={t} actions={actionsOf(t, at)} draggable={mayChange} dragging={dragged?.id === t.id}
                        onDragStart={() => onDrag({ id: t.id, from: side })}
                        onDragEnd={() => { setOver(null); onDrag(null) }}
                        onDragOver={(e, after) => { if (accepts(e)) setOver(after ? at + 1 : at) }}
                      />
                    </Fragment>
                  )
                })}
              </Fragment>
            ))}
            {slot && over === rows.length && <DropSlot text={slot} />}
          </ul>
        )}
        {foot}
      </div>
    </section>
  )
}
