import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '../primitives/Menus'
import { FOCUS_RING, withoutHover } from '../primitives/controlStyles'
import { useAttention } from '../primitives/AttentionDialog'
import { Tooltip } from '../primitives/Tooltip'
import { ConfirmDialog } from '../primitives/ConfirmDialog'

export interface OverflowItem {
  label: string
  onSelect: () => void | Promise<void>
  danger?: boolean
  /** Asks before doing it, in the confirm dialog: these are the question's words, and the item's label its button. */
  confirmLabel?: string
  /** A line under the label saying what it does. */
  hint?: string
  /** Refused for a reason known in advance: greyed but focusable, the reason in its tooltip; a press closes the menu and says it in the dialog. */
  disabledReason?: string
  /** A rule above it, setting it apart from the items before. */
  separatorBefore?: boolean
  /** Only on a phone, where the control it stands for has no room beside the menu (Talk about this task). */
  phoneOnly?: boolean
}

/** "⋯": the actions a task rarely needs, behind one button. */
export function OverflowMenu({ items, label = 'More actions' }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<OverflowItem | null>(null)
  const attention = useAttention()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (items.length === 0) return null
  const close = () => setOpen(false)
  // The reason an action was refused is said in the attention dialog, not lost.
  const select = (item: OverflowItem) => {
    const refused = (err: unknown) => attention.show({ text: err instanceof Error && err.message ? err.message : `${item.label} did not work. Nothing was changed.` })
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
        onClick={() => { if (open) close(); else setOpen(true) }}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-button-secondary text-text-secondary not-disabled:hover:bg-surface-hover not-disabled:hover:border-border-strong not-disabled:active:bg-surface-pressed max-sm:h-11 max-sm:w-11 ${FOCUS_RING} ${OPENS_MENU}`}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {attention.dialog}
      {confirming && (
        <ConfirmDialog
          open
          title={`${confirming.label}?`}
          description={confirming.confirmLabel}
          confirmLabel={confirming.label}
          destructive={confirming.danger}
          onCancel={() => setConfirming(null)}
          onConfirm={() => { const item = confirming; setConfirming(null); select(item) }}
        />
      )}
      {open && (
        <PopSheet label={label} onClose={close} width="sm:w-56">
          <MenuHeading label="Actions" />
          {items.map(item => (
            <Item
              key={item.label}
              item={item}
              onPress={() => {
                if (item.disabledReason) { close(); attention.show({ title: 'Not available now', text: item.disabledReason }); return }
                close()
                if (item.confirmLabel) { setConfirming(item); return }
                select(item)
              }}
            />
          ))}
        </PopSheet>
      )}
    </div>
  )
}

function Item({ item, onPress }: { item: OverflowItem; onPress: () => void }) {
  const reasonId = useId()
  const refused = !!item.disabledReason
  const row = (
    <button
      type="button"
      role="menuitem"
      aria-disabled={refused || undefined}
      aria-describedby={refused ? reasonId : undefined}
      onClick={onPress}
      className={`${refused ? withoutHover(MENU_ITEM) : MENU_ITEM} flex-col !items-start !gap-0 ${item.danger ? '!text-danger' : ''} ${item.separatorBefore ? 'mt-1 border-t border-border-subtle pt-2' : ''} ${item.phoneOnly ? 'sm:hidden' : ''}`}
    >
      {item.label}
      {item.hint && <span className="block text-micro text-text-muted">{item.hint}</span>}
    </button>
  )
  if (!item.disabledReason) return row
  return <><Tooltip label={item.disabledReason} side="left" wrap>{row}</Tooltip><span id={reasonId} hidden>{item.disabledReason}</span></>
}
