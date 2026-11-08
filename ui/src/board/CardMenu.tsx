import { useState } from 'react'
import { Check, ChevronRight, MoreHorizontal } from 'lucide-react'
import { FOCUS_RING } from '../primitives/controlStyles'
import { MENU_ITEM, MenuHeading, OPENS_MENU, PopSheet } from '../primitives/Menus'

/** One of a list of choices one level down (Move to ›, Sprint ›): a check on the one it is now. */
export interface SubChoice {
  label: string
  checked?: boolean
  onSelect: () => void
}

/** An item of a card's or a board's ⋯. With `choices`, it opens a list one level down instead. */
export interface BoardMenuItem {
  label: string
  onSelect?: () => void
  /** A line under the label. */
  hint?: string
  danger?: boolean
  /** Greyed, with why in its tooltip: a refusal known in advance. */
  disabledReason?: string
  /** A rule above it, setting it apart from the items before. */
  separatorBefore?: boolean
  choices?: SubChoice[]
  /** In a list of choices (a filter's menu): whether it is the one chosen, with a check. */
  checked?: boolean
  /** Muted words at the right: what a list one level down has chosen ("Current sprint"). */
  value?: string
  /** A group's heading drawn above it, where a group of choices starts ("A custom field"). */
  groupBefore?: string
  /** A plain fact beside the label, outlined ("Read-only"). */
  badge?: string
  /** Stable identity where two labels may be the same. */
  key?: string
}

/**
 * The items of a ⋯, drawn in a `PopSheet`: the heading (the card's key), then each item; one with choices opens them
 * one level down, with the way back in the heading.
 */
export function BoardMenuItems({ heading, items, onClose }: { heading: string; items: BoardMenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<BoardMenuItem | null>(null)
  if (open?.choices) {
    return (
      <>
        <MenuHeading label={open.label} onBack={() => setOpen(null)} backLabel={`Back to ${heading}`} />
        {open.choices.length === 0 && <p className="px-3 py-2 text-small text-text-muted">None to choose.</p>}
        {open.choices.map(c => (
          <button
            key={c.label} type="button" role="menuitemradio" aria-checked={!!c.checked} className={MENU_ITEM}
            onClick={() => { setOpen(null); onClose(); c.onSelect() }}
          >
            <span className="flex w-4 shrink-0 justify-center self-center text-accent">{c.checked && <Check size={14} aria-hidden />}</span>
            <span className="flex-1">{c.label}</span>
          </button>
        ))}
      </>
    )
  }
  const checks = items.some(i => i.checked !== undefined)
  return (
    <>
      <MenuHeading label={heading} />
      {items.map(item => (
        <div key={item.key ?? item.label} className={item.separatorBefore ? 'mt-1 border-t border-border-subtle pt-1' : ''}>
          {item.groupBefore && <p className="px-3 pb-0.5 pt-2 text-micro font-medium uppercase tracking-wide text-text-muted">{item.groupBefore}</p>}
          <button
            type="button"
            disabled={!!item.disabledReason} aria-disabled={item.disabledReason ? true : undefined} title={item.disabledReason}
            onClick={() => {
              if (item.choices) { setOpen(item); return }
              onClose()
              item.onSelect?.()
            }}
            role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'} aria-checked={item.checked}
            className={`${MENU_ITEM} ${item.danger ? '!text-danger' : ''}`}
          >
            {checks && <span className="mt-0.5 flex w-4 shrink-0 justify-center text-accent">{item.checked && <Check size={14} aria-hidden />}</span>}
            <span className="min-w-0 flex-1">
              <span className={`flex items-center gap-1.5 ${checks ? 'font-medium' : ''}`}>
                {item.label}
                {item.badge && <span className="inline-flex h-5 items-center rounded-full border border-border px-2 text-micro font-medium text-text-secondary">{item.badge}</span>}
              </span>
              {item.hint && <span className="block text-micro text-text-muted">{item.hint}</span>}
            </span>
            {item.value && <span className="shrink-0 self-center text-text-muted">{item.value}</span>}
            {item.choices && <ChevronRight size={14} aria-hidden className="shrink-0 self-center text-text-muted" />}
          </button>
        </div>
      ))}
    </>
  )
}

/**
 * A card's or a list row's ⋯ (28 px, bordered): the actions behind it, in the one menu. `className` places the button
 * (a card shows it only on hover and keyboard focus); it stays shown while its menu is open.
 */
export function BoardMenu({ heading, items, label, className = '', align = 'right' }: {
  heading: string
  items: BoardMenuItem[]
  /** The button's accessible name: "Actions for WEB-14". */
  label: string
  className?: string
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <div className={`relative ${open ? '!opacity-100' : ''} ${className}`} onPointerDown={e => e.stopPropagation()}>
      <button
        type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-hover ${OPENS_MENU} ${FOCUS_RING}`}
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open && (
        <PopSheet label={label} onClose={() => setOpen(false)} align={align} width="sm:w-56">
          <BoardMenuItems heading={heading} items={items} onClose={() => setOpen(false)} />
        </PopSheet>
      )}
    </div>
  )
}
