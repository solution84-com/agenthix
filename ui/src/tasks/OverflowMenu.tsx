import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface OverflowItem {
  label: string
  onSelect: () => void | Promise<void>
  danger?: boolean
  /** Asks again before doing it: the label the second click shows. */
  confirmLabel?: string
}

/** "⋯": the actions a task rarely needs, behind one button. */
export function OverflowMenu({ items, label = 'More actions' }: { items: OverflowItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
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
  return (
    <div className="relative">
      {open && <div className="fixed inset-0 z-10" onClick={close} />}
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-lg border border-border bg-surface-1 p-1.5 text-text-secondary hover:bg-surface-hover"
      >
        <MoreHorizontal size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface-1 shadow-lg">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                if (item.confirmLabel && confirming !== item.label) { setConfirming(item.label); return }
                close()
                void item.onSelect()
              }}
              className={`block w-full px-3 py-2 text-left text-small hover:bg-surface-hover ${item.danger ? 'text-danger' : 'text-text-primary'}`}
            >
              {confirming === item.label && item.confirmLabel ? item.confirmLabel : item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
