import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { FOCUS_RING } from '@agenthix/ui/primitives'

export type MenuItem = { label: string; hint?: string; onSelect: () => void; danger?: boolean; disabled?: boolean; separatorBefore?: boolean; /** Why it is greyed, or what it will do, on hover. */ title?: string }

function useDismiss(open: boolean, close: () => void) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', dismiss)
    return () => { document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [open, close])
  return root
}

function Items({ items, onDone, width }: { items: MenuItem[]; onDone: () => void; width: string }) {
  return (
    <div role="menu" className={`absolute right-0 top-full z-20 mt-1.5 ${width} rounded-xl border border-border bg-surface-1 p-1.5 shadow-lg`}>
      {items.map(item => (
        <div key={item.label}>
          {item.separatorBefore && <hr className="my-1 border-border-subtle" />}
          <button
            type="button" role="menuitem" disabled={item.disabled} title={item.title}
            onClick={() => { onDone(); item.onSelect() }}
            className={`block w-full rounded-md px-2.5 py-2 text-left text-body hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 ${item.danger ? 'text-danger' : 'text-text-primary'}`}
          >
            {item.label}
            {item.hint && <small className="block text-micro text-text-muted">{item.hint}</small>}
          </button>
        </div>
      ))}
    </div>
  )
}

/** The ⋯ button: a short menu of what can be done with the row or page it sits on. */
export function MoreMenu({ items, label = 'More' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const root = useDismiss(open, () => setOpen(false))
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-1 text-text-secondary hover:bg-surface-hover max-sm:h-11 max-sm:w-11 ${FOCUS_RING}`}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      {open && <Items items={items} onDone={() => setOpen(false)} width="w-56" />}
    </div>
  )
}

/** A primary button that opens a menu: "＋ Add ▾", "＋ New ▾". */
export function MenuButton({ children, items }: { children: ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useDismiss(open, () => setOpen(false))
  return (
    <div ref={root} className="relative inline-flex">
      <button
        type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-body font-medium text-on-accent transition-colors hover:bg-accent-hover"
      >
        {children} <ChevronDown size={14} aria-hidden />
      </button>
      {open && <Items items={items} onDone={() => setOpen(false)} width="w-64" />}
    </div>
  )
}
