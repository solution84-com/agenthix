import { useEffect, useRef, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import type { PhoneAction } from './phoneActions'
import { FOCUS_RING_INSET, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import { TOP_BAR_BUTTON } from './topBarStyles'

const ROW = `flex min-h-11 w-full flex-col justify-center rounded-lg px-3 py-1 text-left text-body ${FOCUS_RING_INSET}`

/**
 * The phone top bar's ⋯ and the popover under it (the kit's ⋯ menu): the screen's actions, the main one first with the
 * selected fill; on a project's screen, after a divider, the project's menu. 250 px wide, rows 44 px to tap. Esc, a
 * choice or a tap away closes it, and focus goes back to the ⋯.
 */
export function PhoneActionsMenu({ actions, placeMenu, label = 'Actions for this screen' }: {
  actions: PhoneAction[]
  placeMenu?: { name: string; onOpen: () => void } | null
  /** The ⋯'s name, and its menu's. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    const close = (refocus: boolean) => { setOpen(false); if (refocus) button.current?.focus() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(true) } }
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  if (!actions.length && !placeMenu) return null

  const choose = (run: () => void) => { setOpen(false); button.current?.focus(); run() }
  const arrow = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])]
    if (!items.length) return
    e.preventDefault()
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${TOP_BAR_BUTTON} aria-expanded:bg-selected aria-expanded:text-text-primary`}
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={arrow}
          className="absolute right-0.5 top-full z-50 mt-1 flex w-[250px] flex-col rounded-xl border border-border bg-popover p-1.5 shadow-pop"
        >
          {actions.map((a, i) => {
            const disabled = !!a.disabledWhy
            const tone = disabled
              ? 'cursor-not-allowed text-text-muted'
              : i === 0 ? ROW_CHOSEN : a.danger ? `${ROW_ITEM} text-danger!` : ROW_ITEM
            return (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                aria-disabled={disabled || undefined}
                title={a.disabledWhy}
                onClick={disabled ? undefined : () => choose(a.onSelect)}
                className={`${ROW} ${tone}`}
              >
                <span className="truncate">{a.label}</span>
                {(a.disabledWhy ?? a.hint) && <span className="text-micro font-normal text-text-muted">{a.disabledWhy ?? a.hint}</span>}
              </button>
            )
          })}
          {placeMenu && (
            <>
              {actions.length > 0 && <div role="separator" className="mx-1 my-1.5 h-px shrink-0 bg-border-subtle" />}
              <button type="button" role="menuitem" onClick={() => choose(placeMenu.onOpen)} className={`${ROW} ${ROW_ITEM}`}>
                <span className="truncate">{placeMenu.name} menu ›</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
