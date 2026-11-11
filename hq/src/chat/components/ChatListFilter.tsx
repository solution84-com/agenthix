import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FilterSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import { chatListChoices, type ChatListView } from '../../shared/conversations/chatList'

/** How many of the three this button holds are set. */
export const filtersSet = (view: ChatListView) => [view.place, view.agentId].filter(Boolean).length + (view.archived ? 1 : 0)

/**
 * One *Filter ▾* for project, agent and the archived ones, saying how many are set. Its panel closes on Esc, on a
 * click outside it, and when focus leaves it.
 */
export function ChatListFilter({ view, choices, onChange }: {
  view: ChatListView
  choices: ReturnType<typeof chatListChoices>
  onChange: (next: Partial<ChatListView>) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const set = filtersSet(view)

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((was) => !was)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-small font-medium ${FOCUS_RING} ${set > 0 ? 'border-border bg-selected text-text-primary' : 'border-border bg-button-secondary text-text-primary hover:bg-surface-hover hover:border-border-strong active:bg-surface-pressed'}`}
      >
        Filter
        {set > 0 && <span data-testid="filters-set">{set}</span>}
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div role="dialog" aria-label="Filter" className="absolute right-0 top-full z-20 mt-1 flex w-60 flex-col items-start gap-2 rounded-xl border border-border bg-popover p-3 shadow-pop">
          <FilterSelect label="Filter by project" value={view.place ?? ''} onChange={(v) => onChange({ place: v || null })}>
            <option value="">All projects</option>
            {choices.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Filter by agent" value={view.agentId ?? ''} onChange={(v) => onChange({ agentId: v || null })}>
            <option value="">All agents</option>
            {choices.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </FilterSelect>
          <button
            type="button"
            aria-pressed={view.archived}
            onClick={() => onChange({ archived: !view.archived })}
            className={`rounded-full border px-2.5 py-1 text-small font-medium ${FOCUS_RING} ${view.archived ? 'border-border bg-selected text-text-primary' : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed'}`}
          >
            Archived
          </button>
        </div>
      )}
    </div>
  )
}
