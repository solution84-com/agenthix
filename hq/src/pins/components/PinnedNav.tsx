import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X } from 'lucide-react'
import { getPins, reorderPins, unpinItem, useAction, useQuery } from 'wasp/client/operations'
import type { PinnedItem } from '../pinTypes'
import { activePinId, movedOrder } from '../pinOrder'
import { PinAvatar } from './PinAvatar'

type PinnedNavProps = {
  /** While editing, rows are dragged to reorder and each has an unpin button; otherwise they are links. */
  editing?: boolean
  /** The collapsed navigation shows avatars only. */
  collapsed?: boolean
  /** Called with a pin's id when it is followed (the foot remembers the last one used, and a phone's drawer closes). */
  onFollow?: (id: string) => void
}

/** The person's pins, in their order (spec §1). The heading and its Edit control belong to the foot's list around it. */
export function PinnedNav({ editing = false, collapsed = false, onFollow }: PinnedNavProps) {
  const { data: pins } = useQuery(getPins)
  const reorder = useAction(reorderPins)
  const unpin = useAction(unpinItem)
  const { pathname } = useLocation()

  // Held locally so a drop shows at once rather than after the round trip.
  const [items, setItems] = useState<PinnedItem[]>([])
  useEffect(() => setItems(pins ?? []), [pins])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  if (items.length === 0) return null
  const activeId = activePinId(items, pathname)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const ids = items.map((i) => i.id)
    const order = movedOrder(ids, String(active.id), String(over.id))
    if (order === ids) return
    const byId = new Map(items.map((i) => [i.id, i]))
    setItems(order.map((id) => byId.get(id)!))
    reorder({ pinIds: order }).catch(() => setItems(pins ?? []))
  }

  const rows = items.map((item) => (
    <PinRow
      key={item.id}
      item={item}
      active={item.id === activeId}
      editing={editing}
      collapsed={collapsed}
      onFollow={onFollow}
      onUnpin={() => void unpin({ kind: item.kind, itemId: item.itemId })}
    />
  ))

  return (
    <ul aria-label="Pinned" className="space-y-0.5">
      {editing ? <DndContext sensors={sensors} onDragEnd={onDragEnd}>{rows}</DndContext> : rows}
    </ul>
  )
}

type PinRowProps = {
  item: PinnedItem
  active: boolean
  editing: boolean
  collapsed: boolean
  onFollow?: (id: string) => void
  onUnpin: () => void
}

function PinRow({ item, active, editing, collapsed, onFollow, onUnpin }: PinRowProps) {
  const rowClass = `flex items-center gap-2 rounded-lg text-small transition-colors ${
    collapsed ? 'justify-center p-1.5' : 'px-2 py-1.5'
  } ${active ? 'bg-surface-3 text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`

  if (editing) return <EditableRow item={item} rowClass={rowClass} collapsed={collapsed} onUnpin={onUnpin} />

  return (
    <li>
      <Link
        to={item.href}
        onClick={() => onFollow?.(item.id)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.name : undefined}
        className={rowClass}
      >
        <PinAvatar item={item} />
        {!collapsed && <span className="truncate">{item.name}</span>}
      </Link>
    </li>
  )
}

function EditableRow({ item, rowClass, collapsed, onUnpin }: { item: PinnedItem; rowClass: string; collapsed: boolean; onUnpin: () => void }) {
  const drag = useDraggable({ id: item.id })
  const drop = useDroppable({ id: item.id })
  const setRef = (node: HTMLLIElement | null) => {
    drag.setNodeRef(node)
    drop.setNodeRef(node)
  }
  return (
    <li
      ref={setRef}
      style={{ transform: CSS.Translate.toString(drag.transform) }}
      className={`${rowClass} ${drag.isDragging ? 'relative z-10 opacity-80' : ''} ${drop.isOver && !drag.isDragging ? 'ring-1 ring-accent' : ''}`}
    >
      <button
        type="button"
        {...drag.listeners}
        {...drag.attributes}
        aria-label={`Move ${item.name}`}
        className="cursor-grab touch-none text-text-muted hover:text-text-primary"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <PinAvatar item={item} />
      {!collapsed && <span className="truncate flex-1">{item.name}</span>}
      <button
        type="button"
        onClick={onUnpin}
        aria-label={`Unpin ${item.name}`}
        className="p-0.5 rounded text-text-muted hover:text-text-primary"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}
