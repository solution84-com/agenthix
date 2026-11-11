import { useState, type DragEvent } from 'react'
import { GripVertical, MoreHorizontal } from 'lucide-react'
import { BUTTON_GHOST, MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '@agenthix/ui/primitives'
import { SprintAgentMark, SprintTaskFacts, type SprintCard } from './SprintTaskBits'

export type RowAction = { label: string; onSelect: () => void; disabledWhy?: string }

export const PLAN_DRAG_TYPE = 'application/x-plan-task'

const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${BUTTON_GHOST} max-sm:h-11 max-sm:w-11 ${OPENS_MENU}`

/**
 * One task on Plan Sprint (the design's keys 6 and 10): ⠿ to drag it, its agent ringed with its run, its title over its
 * key, type and column, and ⋯ with the moves for the keyboard and the phone (a sheet from the foot on a phone).
 * Dragged, its place is left as a faint outline.
 */
export function PlanRow({ task, actions, draggable, dragging, onDragStart, onDragEnd, onDragOver }: {
  task: SprintCard
  actions: RowAction[]
  draggable: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent, after: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li
      data-testid={`plan-row-${task.key}`}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.setData(PLAN_DRAG_TYPE, task.id); e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        const box = e.currentTarget.getBoundingClientRect()
        onDragOver(e, e.clientY > box.top + box.height / 2)
      }}
      className={`relative grid min-h-14 grid-cols-[16px_40px_minmax(0,1fr)_36px] items-center gap-x-2 border-t border-border-subtle px-1 max-lg:grid-cols-[40px_minmax(0,1fr)_44px] ${dragging ? 'rounded-lg border border-dashed border-border opacity-45' : ''}`}
    >
      <span aria-hidden title="Drag" className={`inline-flex text-text-muted max-lg:hidden ${draggable ? 'cursor-grab' : 'opacity-40'}`}><GripVertical size={14} /></span>
      <span className="flex justify-center"><SprintAgentMark task={task} /></span>
      <span className="min-w-0">
        <span className="block truncate text-small font-medium text-text-primary">{task.title}</span>
        <SprintTaskFacts task={task} />
      </span>
      <span className="relative">
        <button type="button" aria-label={`${task.key}: more`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} className={ICON_BUTTON}>
          <MoreHorizontal size={16} aria-hidden />
        </button>
        {open && (
          <PopSheet label={`${task.key}: moves`} onClose={() => setOpen(false)} width="sm:w-56">
            <div className="sm:hidden"><MenuHeading label={`${task.key} · ${task.title}`} /></div>
            {actions.map(a => (
              <button
                key={a.label} type="button" role="menuitem" className={MENU_ITEM} disabled={!!a.disabledWhy} title={a.disabledWhy}
                onClick={() => { setOpen(false); a.onSelect() }}
              >
                {a.label}
              </button>
            ))}
          </PopSheet>
        )}
      </span>
    </li>
  )
}

/** The dashed slot where a dragged row will land, saying what happens: "Drops here, 3rd · moves to To do" (key 7). */
export function DropSlot({ text }: { text: string }) {
  return (
    <li aria-hidden className="my-0.5 flex min-h-13 items-center justify-center rounded-lg border-[1.5px] border-dashed border-border-strong bg-surface-hover text-small text-text-secondary">
      {text}
    </li>
  )
}
