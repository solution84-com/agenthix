import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { MenuItem } from '../../../org/components/menus'

/** ＋ Add ▾, the one way into a place's skills: in the header, or at the foot of the screen on a phone, where it opens upward. */
export function PlaceAddMenu({ items, phone }: { items: MenuItem[]; phone: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [open])
  if (items.length === 0) return null
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-body font-medium text-on-accent transition-colors hover:bg-accent-hover"
      >
        ＋ Add <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div role="menu" className={`absolute z-20 w-64 rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg ${phone ? 'bottom-full left-0 mb-1.5' : 'right-0 top-full mt-1.5'}`}>
          {items.map((item) => (
            <button
              key={item.label} type="button" role="menuitem"
              onClick={() => { setOpen(false); item.onSelect() }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-body text-text-primary hover:bg-surface-hover"
            >
              {item.label}
              {item.hint && <small className="block text-micro text-text-muted">{item.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Whether the screen is a phone's, by the width the app's own layout changes at. */
export function useIsPhone(): boolean {
  const query = '(max-width: 767px)'
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setPhone(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return phone
}
