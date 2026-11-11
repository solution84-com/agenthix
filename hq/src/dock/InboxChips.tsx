import type { InboxFilters } from '../shared/conversations/inbox'
import { Check } from 'lucide-react'
import { FOCUS_RING, FilterTabs } from '@agenthix/ui/primitives'

type Chosen = 'all' | 'unread' | 'needs'

/**
 * *All*, *Unread* and *Needs you* (only while something does, or while it is chosen), each with its count: a choice of
 * one, drawn as the filter tabs. The counts are over the list as held, whatever is chosen.
 */
export function InboxChips({ filters, totals, onChange }: {
  filters: InboxFilters
  totals: { needsYou: number; unread: number }
  onChange: (next: InboxFilters) => void
}) {
  const chosen: Chosen = filters.needsYou ? 'needs' : filters.unread ? 'unread' : 'all'
  const next: Record<Chosen, InboxFilters> = {
    all: { needsYou: false, unread: false },
    unread: { needsYou: false, unread: true },
    needs: { needsYou: true, unread: false },
  }
  return (
    <FilterTabs<Chosen>
      label="Show"
      value={chosen}
      onChange={(id) => onChange(next[id])}
      tabs={[
        { value: 'all', label: 'All' },
        { value: 'unread', label: 'Unread', count: totals.unread },
        ...(totals.needsYou > 0 || filters.needsYou ? [{ value: 'needs' as const, label: 'Needs you', count: totals.needsYou }] : []),
      ]}
    />
  )
}

export function FilterToggle({ label, count, on, onToggle }: { label: string; count?: number; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-small font-medium ${FOCUS_RING} ${on ? 'bg-selected text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed'}`}
    >
      {on && <Check size={12} aria-hidden />}
      {label}
      {count !== undefined && <span className="text-text-muted">{count}</span>}
    </button>
  )
}
