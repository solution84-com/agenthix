import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { ModelChoice, ModelChoices } from '../../shared/conversations/protocol'
import { PICKER_MAX_HEIGHT, makerInitials, moveHighlight, pickerPlacement, pickerRows, priceHint, shortModelName } from './modelPickerLogic'

type Props = {
  /** Makes the chip a quiet button — no border, muted, the maker's mark and the short model name. */
  quiet?: boolean
  /** The choices from `getModelChoices`; absent while they load. */
  choices: ModelChoices | undefined
  /** The chosen model id, or '' for the form's own empty choice. */
  value: string
  onChange: (model: string) => void
  /** Keeps the form's own empty choice on top of the list, in these words ("The organisation's (…)"). */
  emptyLabel?: string
  /** What the chip says for a value the choices do not hold. */
  labelOf?: (model: string) => string
  /** Opens above the chip, for a chip at the bottom of the screen. */
  above?: boolean
  disabled?: boolean
  /** The chip's id, so a form's label points at it. */
  id?: string
  ariaLabel?: string
}

const EMPTY = ''

/** The window's visible rows, narrowed by every ancestor that clips what overflows it. */
function visibleBounds(el: HTMLElement): { top: number; bottom: number } {
  let top = 0
  let bottom = window.innerHeight
  for (let a = el.parentElement; a; a = a.parentElement) {
    if (getComputedStyle(a).overflowY === 'visible') continue
    const r = a.getBoundingClientRect()
    top = Math.max(top, r.top)
    bottom = Math.min(bottom, r.bottom)
  }
  return { top, bottom }
}

/**
 * One model picker, everywhere a model is chosen: a chip with the current model (quiet beside a message box); opened, a search field, the
 * person's recent models, then the rest grouped by who makes them with the access that reaches them beside each
 * group. On a phone it is a sheet from the bottom.
 */
export function ModelPicker({ quiet = false, choices, value, onChange, emptyLabel, labelOf, above = false, disabled = false, id, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [highlight, setHighlight] = useState(0)
  const [placement, setPlacement] = useState({ above, maxHeight: PICKER_MAX_HEIGHT })
  const root = useRef<HTMLDivElement>(null)
  const chip = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()

  const rows = useMemo(
    () => pickerRows(choices?.models ?? [], choices?.recent ?? [], query, expanded),
    [choices, query, expanded],
  )
  const emptyChoice: ModelChoice | null = emptyLabel !== undefined && query.trim() === ''
    ? { value: EMPTY, label: emptyLabel, maker: '', via: '', price: 1 }
    : null
  const flat = emptyChoice ? [emptyChoice, ...rows.flat] : rows.flat

  const close = () => { setOpen(false); setQuery(''); setExpanded(new Set()); chip.current?.focus() }
  const choose = (model: string) => { onChange(model); close() }

  useLayoutEffect(() => {
    if (!open || !chip.current) return
    setPlacement(pickerPlacement(chip.current.getBoundingClientRect(), visibleBounds(chip.current), above))
  }, [open, above])
  useEffect(() => { if (open) search.current?.focus() }, [open])
  useEffect(() => { setHighlight(0) }, [query])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  })

  const known = choices?.models.find(m => m.value === value) ?? choices?.recent.find(m => m.value === value)
  const chipText = !value && emptyLabel !== undefined ? emptyLabel : known?.label ?? (value ? (labelOf?.(value) ?? value) : 'Choose a model')

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => moveHighlight(h, e.key as 'ArrowDown' | 'ArrowUp', flat.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = flat[highlight]; if (pick) choose(pick.value) }
  }

  const indexOf = (m: ModelChoice, section: 'empty' | 'recent' | 'group') =>
    section === 'empty' ? 0 : flat.indexOf(m, section === 'recent' ? 0 : (emptyChoice ? 1 : 0) + rows.recent.length)
  const optionId = (i: number) => `${listId}-${i}`

  const row = (m: ModelChoice, section: 'empty' | 'recent' | 'group', showVia = false) => {
    const i = indexOf(m, section)
    const current = m.value === value
    return (
      <li
        key={`${section}-${m.value}`}
        id={optionId(i)}
        role="option"
        aria-selected={current}
        onMouseEnter={() => setHighlight(i)}
        onClick={() => choose(m.value)}
        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small max-lg:min-h-10 ${i === highlight ? 'bg-surface-hover' : ''}`}
      >
        <span className="w-4 shrink-0 text-accent">{current && <Check size={14} aria-hidden />}</span>
        <span className="min-w-0 flex-1 truncate text-text-primary">{m.label}</span>
        {section !== 'empty' && (
          <>
            {showVia && <span className="shrink-0 text-text-muted">{m.via}</span>}
            {section === 'recent' && <span className="shrink-0 text-text-muted">{m.maker}</span>}
            <span className="w-8 shrink-0 text-right text-text-muted" aria-label={`Price ${m.price} of 3`}>{priceHint(m.price)}</span>
          </>
        )}
      </li>
    )
  }

  return (
    <div ref={root} className="relative inline-block">
      <button
        ref={chip}
        id={id}
        type="button"
        disabled={disabled || !choices}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={quiet
          ? 'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-small text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-60 max-lg:min-h-10'
          : 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-chip px-2.5 py-1 text-small text-text-primary hover:bg-surface-hover disabled:opacity-60 max-lg:min-h-10'}
      >
        {quiet ? (
          <>
            {known && (
              <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded bg-chip text-[9px] font-semibold text-text-secondary">
                {makerInitials(known.maker)}
              </span>
            )}
            <span className="truncate">{known ? shortModelName(known.label, known.maker) : chipText}</span>
          </>
        ) : (
          <span className="truncate">{chipText}</span>
        )}
        <ChevronDown size={12} aria-hidden className="shrink-0 text-text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-scrim lg:hidden" aria-hidden onClick={close} />
          <div
            data-testid="model-picker"
            onKeyDown={onKeyDown}
            style={{ '--picker-max': `${placement.maxHeight}px` } as React.CSSProperties}
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-t-2xl border border-border bg-surface-1 shadow-pop lg:absolute lg:inset-x-auto lg:bottom-auto lg:left-0 lg:max-h-(--picker-max) lg:w-96 lg:rounded-xl ${placement.above ? 'lg:bottom-full lg:mb-1' : 'lg:top-full lg:mt-1'}`}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
            <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
              <Search size={14} aria-hidden className="shrink-0 text-text-muted" />
              <input
                ref={search}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search models"
                aria-label="Search models"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={flat.length ? optionId(highlight) : undefined}
                className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <span className="shrink-0 rounded border border-border px-1 text-[11px] text-text-muted max-lg:hidden">esc</span>
            </div>
            <ul id={listId} role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {emptyChoice && row(emptyChoice, 'empty')}
              {rows.recent.length > 0 && (
                <>
                  <li role="presentation" className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Recent</li>
                  {rows.recent.map(m => row(m, 'recent'))}
                </>
              )}
              {rows.groups.map(g => (
                <li key={g.maker} role="presentation">
                  <p className="flex justify-between gap-2 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                    <span>{g.maker}</span>
                    <span className="font-normal normal-case tracking-normal">{g.via}</span>
                  </p>
                  <ul role="presentation">
                    {g.shown.map(m => row(m, 'group', g.shown.filter(o => o.label === m.label).length > 1))}
                  </ul>
                  {g.hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setExpanded(s => new Set(s).add(g.maker))}
                      className="px-2 py-1 pl-8 text-small text-accent hover:underline max-lg:min-h-10"
                    >
                      Show {g.hidden} more {g.maker}
                    </button>
                  )}
                </li>
              ))}
              {flat.length === 0 && <li role="presentation" className="px-2 py-3 text-small text-text-muted">No model matches “{query}”.</li>}
            </ul>
            <p className="border-t border-border-subtle px-3 py-2 text-small text-text-muted">Only models your access reaches</p>
          </div>
        </>
      )}
    </div>
  )
}
