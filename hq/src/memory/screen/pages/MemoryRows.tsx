import type { ReactNode } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { MemoryItemView } from '../../../shared/memory/protocol'
import { useMarkedItem } from '../../../shared/hooks/useMarkedItem'
import { KIND_LABELS, agentsLabel, placeLabel, recalledTimesText, savedDayText } from './memoryFormat'

/** One plain badge; the kind's is dashed, so it reads apart from where the memory holds. No colour for any scope. */
export function MemoryBadge({ children, kind = false }: { children: ReactNode; kind?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 text-micro text-text-secondary ${kind ? 'border-dashed border-border-strong' : 'border-border'}`}>
      {children}
    </span>
  )
}

/** The line under a row's title: kind, which agents, where; then the tags, the date and how often it was recalled. */
function MetaLine({ item }: { item: MemoryItemView }) {
  const after = [
    ...(item.tags.length ? [item.tags.join(', ')] : []),
    savedDayText(item.createdAt),
    ...(item.recallCount > 0 ? [recalledTimesText(item.recallCount)] : []),
  ]
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-small text-text-muted">
      <MemoryBadge kind>{KIND_LABELS[item.kind]}</MemoryBadge>
      <MemoryBadge>{agentsLabel(item)}</MemoryBadge>
      <MemoryBadge>{placeLabel(item)}</MemoryBadge>
      {item.archived && <MemoryBadge>Archived</MemoryBadge>}
      <span>{after.join(' · ')}</span>
    </span>
  )
}

/** The rows of a memory list: pressing one opens it. The memory an older *Show in Memory* link names is marked. */
export function MemoryRows({ items, onOpen }: { items: MemoryItemView[]; onOpen: (id: string) => void }) {
  const { markOf } = useMarkedItem('memory')
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface-1">
      {items.map(item => {
        const marked = markOf(item.key)
        return (
          <li key={item.id} {...marked} className={`first:rounded-t-xl last:rounded-b-xl ${marked.className ?? ''}`}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className={`block w-full px-4 py-3 text-left hover:bg-surface-hover active:bg-surface-pressed ${item.archived ? 'opacity-60' : ''} ${FOCUS_RING}`}
            >
              <span className="block text-body font-medium text-text-primary">{item.title}</span>
              <MetaLine item={item} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
