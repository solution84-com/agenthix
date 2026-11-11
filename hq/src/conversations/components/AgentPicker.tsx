import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { ROW_CHOSEN, BUTTON_GHOST } from '@agenthix/ui/primitives'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { AuthedAgentAvatar } from '../../shared/components/AuthedAgentAvatar'
import { filterAgents } from './agentPickerLogic'
import { moveHighlight } from '../../shared/components/models/modelPickerLogic'

type Props = {
  /** In the order the server gave them: the primary agent, the recent ones, then the rest by name. */
  agents: ConversationAgentView[]
  selectedId: string
  onSelect: (id: string) => void
  disabled?: boolean
  /** Opens above the button, for one at the bottom of the screen. */
  above?: boolean
}

/**
 * The agent a conversation starts with, as a quiet button — its face, its name, a chevron. Opened, a search field
 * over name, handle and role; on a phone a sheet from the bottom.
 */
export function AgentPicker({ agents, selectedId, onSelect, disabled = false, above = false }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()

  const shown = useMemo(() => filterAgents(agents, query), [agents, query])
  const current = agents.find(a => a.id === selectedId)

  const close = () => { setOpen(false); setQuery(''); button.current?.focus() }
  const choose = (id: string) => { onSelect(id); close() }

  useEffect(() => { if (open) search.current?.focus() }, [open])
  useEffect(() => { setHighlight(0) }, [query])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  })

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => moveHighlight(h, e.key as 'ArrowDown' | 'ArrowUp', shown.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = shown[highlight]; if (pick) choose(pick.id) }
  }

  return (
    <div ref={root} className="relative inline-block">
      <button
        ref={button}
        type="button"
        disabled={disabled || !current}
        aria-label="Agent"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-small max-lg:min-h-10 ${BUTTON_GHOST}`}
      >
        {current && <AuthedAgentAvatar name={current.name} avatarUrl={current.avatarUrl} size="sm" />}
        <span className="truncate">{current?.name}</span>
        <ChevronDown size={12} aria-hidden className="shrink-0 text-text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-scrim lg:hidden" aria-hidden onClick={close} />
          <div
            data-testid="agent-picker"
            onKeyDown={onKeyDown}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-popover shadow-pop lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:max-h-[420px] lg:w-96 lg:rounded-xl ${above ? 'lg:bottom-full lg:mb-1' : 'lg:top-full lg:mt-1'}`}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <Search size={14} aria-hidden className="shrink-0 text-text-muted" />
              <input
                ref={search}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search agents"
                aria-label="Search agents"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={shown.length ? `${listId}-${highlight}` : undefined}
                className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <span className="shrink-0 rounded border border-border px-1 text-micro text-text-muted max-lg:hidden">esc</span>
            </div>
            <ul id={listId} role="listbox" aria-label="Agents" className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {shown.map((a, i) => (
                <li
                  key={a.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={a.id === selectedId}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(a.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small max-lg:min-h-10 ${a.id === selectedId ? ROW_CHOSEN : i === highlight ? 'bg-surface-hover text-text-primary' : 'text-text-secondary'}`}
                >
                  <span className="w-4 shrink-0 text-text-primary">{a.id === selectedId && <Check size={14} aria-hidden />}</span>
                  <AuthedAgentAvatar name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {a.role && <span className="max-w-[45%] shrink-0 truncate text-text-muted">{a.role}</span>}
                </li>
              ))}
              {shown.length === 0 && <li role="presentation" className="px-2 py-3 text-small text-text-muted">No agent matches “{query}”.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
