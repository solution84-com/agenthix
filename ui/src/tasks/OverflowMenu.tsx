import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '../primitives/Menus'
import { FOCUS_RING } from '../primitives/controlStyles'

export interface OverflowItem {
  label: string
  onSelect: () => void | Promise<void>
  danger?: boolean
  /** Asks again before doing it: the label the second click shows. */
  confirmLabel?: string
  /** A line under the label saying what it does. */
  hint?: string
  /** Greyed, with why in its tooltip: a refusal known in advance. */
  disabledReason?: string
  /** A rule above it, setting it apart from the items before. */
  separatorBefore?: boolean
  /** Only on a phone, where the control it stands for has no room beside the menu (Talk about this task). */
  phoneOnly?: boolean
}

/** "⋯": the actions a task rarely needs, behind one button. */
export function OverflowMenu({ items, label = 'More actions' }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      setConfirming(null)
      button.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (items.length === 0) return null
  const close = () => { setOpen(false); setConfirming(null) }
  // The reason an action was refused is said beside the button, not lost.
  const select = (item: OverflowItem) => {
    setFailure(null)
    const refused = (err: unknown) => setFailure(err instanceof Error && err.message ? err.message : `${item.label} did not work. Nothing was changed.`)
    try {
      void Promise.resolve(item.onSelect()).catch(refused)
    } catch (err) {
      refused(err)
    }
  }
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setFailure(null); if (open) close(); else setOpen(true) }}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-hover max-sm:h-11 max-sm:w-11 ${FOCUS_RING} ${OPENS_MENU}`}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {failure && !open && (
        <div role="alert" className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-danger/30 bg-surface-1 px-3 py-2 text-small text-danger shadow-lg">
          {failure}
        </div>
      )}
      {open && (
        <PopSheet label={label} onClose={close} width="sm:w-56">
          <MenuHeading label="Actions" />
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={!!item.disabledReason}
              aria-disabled={item.disabledReason ? true : undefined}
              title={item.disabledReason}
              onClick={() => {
                if (item.confirmLabel && confirming !== item.label) { setConfirming(item.label); return }
                close()
                select(item)
              }}
              className={`${MENU_ITEM} flex-col !items-start !gap-0 ${item.danger ? '!text-danger' : ''} ${item.separatorBefore ? 'mt-1 border-t border-border-subtle pt-2' : ''} ${item.phoneOnly ? 'sm:hidden' : ''}`}
            >
              {confirming === item.label && item.confirmLabel ? item.confirmLabel : item.label}
              {item.hint && <span className="block text-micro text-text-muted">{item.hint}</span>}
            </button>
          ))}
        </PopSheet>
      )}
    </div>
  )
}
