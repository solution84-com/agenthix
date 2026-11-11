import { useState } from 'react'
import { Input } from '@agenthix/ui/primitives'

type Item = { id: string; name: string }

/** A checklist with a search box, for organisations with many projects or people. */
export function SearchableChecklist({ label, items, chosen, onChange, empty }: {
  label: string
  items: Item[]
  chosen: string[]
  onChange: (chosen: string[]) => void
  empty: string
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().toLowerCase()
  const shown = term ? items.filter((i) => i.name.toLowerCase().includes(term)) : items
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()}`} />
        <span className="shrink-0 text-small text-text-muted">{chosen.length} chosen</span>
      </div>
      <ul className="max-h-64 overflow-y-auto rounded-lg border border-border" aria-label={label}>
        {shown.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-small hover:bg-surface-hover">
              <input className="accent-accent" type="checkbox" checked={chosen.includes(i.id)} onChange={() => toggle(i.id)} />
              {i.name}
            </label>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-2 text-small text-text-muted">{empty}</li>}
        {items.length > 0 && shown.length === 0 && <li className="px-3 py-2 text-small text-text-muted">Nothing matches "{search.trim()}".</li>}
      </ul>
    </div>
  )
}
