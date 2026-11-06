import type { InboxFilters } from '../shared/conversations/inbox'
import { Check } from 'lucide-react'

/**
 * *All*, *Unread* and *Needs you* (only while something does, or while it is chosen) as tabs: a choice of one, the chosen
 * one underlined. The counts are over the list as held, whatever is chosen.
 */
export function InboxChips({ filters, totals, onChange }: {
  filters: InboxFilters
  totals: { needsYou: number; unread: number }
  onChange: (next: InboxFilters) => void
}) {
  const chosen = filters.needsYou ? 'needs' : filters.unread ? 'unread' : 'all'
  const tab = (id: string, label: string, next: InboxFilters, count?: number) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={chosen === id}
      onClick={() => onChange(next)}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 text-small max-lg:min-h-11 ${chosen === id ? 'border-accent font-semibold text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
    >
      {label}
      {count !== undefined && <span className="font-normal text-text-muted">{count}</span>}
    </button>
  )
  return (
    <div className="flex items-end gap-5 border-b border-border-subtle" role="tablist" aria-label="Show">
      {tab('all', 'All', { needsYou: false, unread: false })}
      {tab('unread', 'Unread', { needsYou: false, unread: true }, totals.unread)}
      {(totals.needsYou > 0 || filters.needsYou) && tab('needs', 'Needs you', { needsYou: true, unread: false }, totals.needsYou)}
    </div>
  )
}

export function FilterToggle({ label, count, on, onToggle }: { label: string; count?: number; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-small font-medium ${on ? 'border-accent bg-accent-subtle text-accent' : 'border-border text-text-secondary hover:bg-surface-hover'}`}
    >
      {on && <Check size={12} aria-hidden />}
      {label}
      {count !== undefined && <span className="text-text-muted">{count}</span>}
    </button>
  )
}
