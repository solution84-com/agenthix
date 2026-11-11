import { useEffect, useState, type ReactNode } from 'react'
import { CheckGlyph, ChevronDownGlyph, ChevronLeftGlyph } from './Glyphs'
import { CONTROL_HEIGHT, FOCUS_RING_INSET, PLAIN_CONTROL, ROW_CHOSEN, ROW_ITEM } from './controlStyles'

const MENU_ROW = `flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-small ${FOCUS_RING_INSET} max-sm:min-h-11 max-sm:items-center`

/** A menu's item, a row (`ROW_ITEM`): secondary text, one tone step and ink on hover, 44 px to tap on a phone. */
export const MENU_ITEM = `${MENU_ROW} ${ROW_ITEM}`

/** The chosen item of a menu that marks one (`ROW_CHOSEN`): the selected fill, ink text and icon, medium weight. */
export const MENU_ITEM_CHOSEN = `${MENU_ROW} ${ROW_CHOSEN}`

/** A control that opens a menu shows the selected fill, in ink, while it is open. */
export const OPENS_MENU = 'aria-expanded:bg-selected aria-expanded:text-text-primary'

/**
 * A button that opens a picker's menu in a toolbar (Sort, ＋ Filter, Columns, a filter not set): a label and a chevron
 * in plain text (`PLAIN_CONTROL`), the selected fill while its menu is open. The caller gives its height.
 */
export const PLAIN_TRIGGER = `inline-flex items-center gap-1 whitespace-nowrap px-2.5 ${PLAIN_CONTROL} ${OPENS_MENU}`

/**
 * A menu under its button, kept inside its panel by opening toward the side given (`right`: its right edge on the
 * button's); on a phone, a sheet from the foot of the screen with a handle and room for the screen's rounded edge.
 * Escape or a click away closes it. Every menu in the task screens and Members is this one. It is
 * raised by tone (`popover`) as well as by its shadow.
 */
export function PopSheet({ label, onClose, children, align = 'right', width = 'sm:w-72' }: {
  label: string
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Closed by Escape or by a choice, focus goes back to the button that opened it, so the keyboard keeps its place.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => { if (opener?.isConnected && (document.activeElement === document.body || !document.activeElement)) opener.focus() }
  }, [])
  return (
    <>
      <div className="fixed inset-0 z-30 max-sm:bg-scrim" onClick={onClose} />
      <div
        role="menu"
        aria-label={label}
        className={`z-40 max-h-[70vh] overflow-y-auto border border-border bg-popover p-1.5 shadow-pop max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-xl max-sm:pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:absolute sm:top-full sm:mt-1 sm:rounded-xl ${width} ${align === 'right' ? 'sm:right-0' : 'sm:left-0'}`}
      >
        <span aria-hidden data-testid="sheet-handle" className="mx-auto mb-1 mt-0.5 block h-1 w-9 rounded-full bg-border sm:hidden" />
        {children}
      </div>
    </>
  )
}

/** The top of a menu: what it lists, and on a list one level down the way back to the first. */
export function MenuHeading({ label, onBack, backLabel }: { label: string; onBack?: () => void; backLabel?: string }) {
  const words = <span className="text-micro font-medium uppercase tracking-wide text-text-muted">{label}</span>
  return (
    <div className="mb-1 border-b border-border-subtle pb-1">
      {onBack ? (
        <button type="button" onClick={onBack} aria-label={backLabel ?? 'Back'} className={`flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover active:bg-surface-pressed max-sm:min-h-11 ${FOCUS_RING_INSET}`}>
          <ChevronLeftGlyph size={14} className="text-text-muted" />
          {words}
        </button>
      ) : <p className="px-3 py-1.5">{words}</p>}
    </div>
  )
}

export interface SortChoice<T extends string> {
  value: T
  label: string
  hint?: string
}

/** The one Sort control: "Sort: <order> ⌄", opening the orders with a check on the chosen one. */
export function SortMenu<T extends string>({ value, choices, onChange }: {
  value: T
  choices: SortChoice<T>[]
  onChange: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const chosen = choices.find(c => c.value === value) ?? choices[0]
  return (
    <div className="relative">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`${CONTROL_HEIGHT} shrink-0 ${PLAIN_TRIGGER}`}
      >
        Sort: {chosen?.label}
        <ChevronDownGlyph size={14} className="text-text-muted" />
      </button>
      {open && (
        <PopSheet label="Sort" onClose={() => setOpen(false)}>
          <MenuHeading label="Sort" />
          {choices.map(c => (
            <button
              key={c.value} type="button" role="menuitemradio" aria-checked={c.value === value} className={c.value === value ? MENU_ITEM_CHOSEN : MENU_ITEM}
              onClick={() => { onChange(c.value); setOpen(false) }}
            >
              <span className="mt-0.5 flex w-4 shrink-0 justify-center text-text-primary">{c.value === value && <CheckGlyph size={14} />}</span>
              <span>
                <span className="block">{c.label}</span>
                {c.hint && <span className="block text-micro text-text-muted">{c.hint}</span>}
              </span>
            </button>
          ))}
        </PopSheet>
      )}
    </div>
  )
}
