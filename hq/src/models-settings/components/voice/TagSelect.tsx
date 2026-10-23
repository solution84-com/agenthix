import { useState } from 'react'
import { Input } from '@agenthix/ui/primitives'

/** The tag dropdown: Inworld's tags are a long list, so opening it gives a search of its own. */
export function TagSelect({ tags, value, onChange }: { tags: readonly string[]; value: string; onChange: (tag: string) => void }) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const shown = tags.filter(t => t.toLowerCase().includes(find.trim().toLowerCase()))
  const pick = (tag: string) => { onChange(tag); setOpen(false); setFind('') }

  return (
    <div className="relative">
      <button type="button" aria-label="Tag" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent">
        <span className="truncate">{value || 'Any tag'}</span>
        <span aria-hidden className="text-text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface-1 p-2 shadow-xl">
          <Input autoFocus value={find} onChange={e => setFind(e.target.value)} placeholder="Search tags" aria-label="Search tags" />
          <ul role="listbox" aria-label="Tags" className="mt-2 max-h-48 overflow-y-auto">
            <li role="option" aria-selected={!value}>
              <button type="button" className="w-full rounded px-2 py-1 text-left text-small text-text-secondary hover:bg-surface-2" onClick={() => pick('')}>Any tag</button>
            </li>
            {shown.map(t => (
              <li key={t} role="option" aria-selected={t === value}>
                <button type="button" className={`w-full rounded px-2 py-1 text-left text-small hover:bg-surface-2 ${t === value ? 'text-accent' : 'text-text-primary'}`} onClick={() => pick(t)}>{t}</button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-1 text-small text-text-muted">No tag matches</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
