import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'

/** One thing the message box's ＋ can add: a feature gives the composer a list of these. */
export type PlusItem = {
  id: string
  label: string
  /** A short line under the label, such as what the item takes. */
  hint?: string
  icon: ReactNode
  onSelect: () => void
}

/** The ＋ in the message box and the menu it opens. With no items there is nothing to open, so it is not drawn. */
export function PlusMenu({ items }: { items: PlusItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
  }, [open])
  if (items.length === 0) return null
  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label="Add"
        title="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary max-lg:size-10"
      >
        <Plus size={18} aria-hidden />
      </button>
      {open && (
        <div role="menu" data-testid="plus-menu" className="absolute bottom-full left-0 z-30 mb-2 w-max min-w-56 rounded-xl border border-border bg-surface-1 p-1 shadow-pop">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect() }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-small text-text-primary hover:bg-surface-hover max-lg:min-h-10"
            >
              <span aria-hidden className="flex shrink-0 text-text-muted">{item.icon}</span>
              <span className="min-w-0">
                <span className="block">{item.label}</span>
                {item.hint && <span className="block max-w-64 text-micro text-text-muted">{item.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
