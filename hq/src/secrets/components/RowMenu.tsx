import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export type RowMenuItem = { label: string; onPick: () => void; danger?: boolean }

/** The ⋯ menu of a row: History for everyone, the rest for administrators. */
export function RowMenu({ name, items }: { name: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={`More for ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-secondary max-lg:size-10">
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-48 rounded-xl border border-border bg-surface-1 py-1 shadow-pop">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.onPick() }}
              className={`block w-full px-3 py-2 text-left text-small hover:bg-surface-hover ${item.danger ? 'text-danger' : 'text-text-primary'}`}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
