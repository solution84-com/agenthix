import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { SearchField, StatePill, Tooltip, useAttention, useRefusal, type Refusal } from '@agenthix/ui/primitives'

export type DropDownOption = {
  key: string
  label: string
  /** A pill beside the label: what kind of thing it is. */
  tag?: string
  /** One line under the label. */
  hint?: string
  /** Why it cannot be chosen now: it is greyed, the reason is in its tooltip, and a press opens the dialog. */
  refusal?: Refusal
}

/** How an option is named to a screen reader, and in the button once chosen: its label, then its tag. */
export const optionName = (o: DropDownOption): string => (o.tag ? `${o.label} · ${o.tag}` : o.label)

/** More options than this, and the list can be searched. */
const SEARCH_FROM = 8

/**
 * A labelled choice that shows what is chosen and opens to show the rest (board *Changes flow*, proposal): each
 * option with its tag and its one-line hint. Escape or a click elsewhere closes the list and nothing else.
 */
export function DropDown({ label, options, value, onChange, placeholder, disabled = false, refusal, findLabel }: {
  label: string
  options: readonly DropDownOption[]
  value: string | null
  onChange: (key: string) => void
  placeholder: string
  disabled?: boolean
  /** Why the whole choice cannot be used now (in place of `disabled`, which gives no reason). */
  refusal?: Refusal
  /** The search field's label, offered when the list is long. */
  findLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [find, setFind] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const refused = useRefusal(refusal)
  const attention = useAttention()
  const chosen = options.find(o => o.key === value) ?? null
  const q = find.trim().toLowerCase()
  const shown = q ? options.filter(o => optionName(o).toLowerCase().includes(q)) : options

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const toggle = () => {
    setFind('')
    setActive(Math.max(0, options.findIndex(o => o.key === value)))
    setOpen(o => !o)
  }
  const choose = (o: DropDownOption) => {
    setOpen(false)
    button.current?.focus()
    if (o.refusal) {
      const { reason, title, detail, actions } = o.refusal
      attention.show({ title: title ?? 'Not available now', text: detail ?? reason, actions })
      return
    }
    if (o.key !== value) onChange(o.key)
  }
  // Keys while the list is open stay with it: Escape closes the list, not the panel it is in.
  const onKey = (e: KeyboardEvent) => {
    if (!open) return
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); button.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(shown.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); choose(shown[active]) }
  }

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <span id={`${id}-label`} className="mb-1 block text-small font-semibold text-text-secondary">{label}</span>
      <Tooltip label={refused.tooltip ?? ''} side="top" wrap disabled={!refused.tooltip}>
        <button ref={button} type="button" disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open}
          aria-label={`${label}: ${chosen ? optionName(chosen) : placeholder}`} {...refused.props}
          className={`flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-body focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${refusal ? '' : 'hover:border-border-strong'}`}>
        <span className={`min-w-0 flex-1 truncate ${chosen ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>{chosen ? chosen.label : placeholder}</span>
        {chosen?.tag && <StatePill>{chosen.tag}</StatePill>}
        <ChevronDown size={15} aria-hidden className="flex-none text-text-muted" />
        </button>
      </Tooltip>
      {refused.dialog}
      {attention.dialog}
      {open && (
        <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-surface-1 shadow-pop">
          {options.length >= SEARCH_FROM && (
            <div className="border-b border-border-subtle p-2">
              <SearchField label={findLabel ?? `Find ${label.toLowerCase()}`} value={find} onChange={v => { setFind(v); setActive(0) }} className="w-full" />
            </div>
          )}
          <ul role="listbox" aria-labelledby={`${id}-label`} className="max-h-72 overflow-y-auto">
            {shown.length === 0 && <li className="px-3 py-2 text-small text-text-secondary">Nothing is called that.</li>}
            {shown.map((o, i) => (
              <Tooltip key={o.key} label={o.refusal?.reason ?? ''} side="top" wrap disabled={!o.refusal}>
                <li role="option" aria-selected={o.key === value} aria-label={optionName(o)} aria-disabled={o.refusal ? true : undefined} onClick={() => choose(o)} onPointerEnter={() => setActive(i)}
                  className={`cursor-pointer border-b border-border-subtle px-3 py-2 last:border-0 aria-disabled:opacity-40 ${i === active && !o.refusal ? 'bg-surface-hover' : ''} ${o.key === value ? 'bg-selected' : ''}`}>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-text-primary">{o.label}</span>
                    {o.tag && <StatePill>{o.tag}</StatePill>}
                  </span>
                  {o.hint && <span className="block text-small text-text-secondary">{o.hint}</span>}
                </li>
              </Tooltip>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
