import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { FOCUS_RING } from '@agenthix/ui/primitives'

/**
 * One part of the view's breadcrumb that opens a menu below it (the workspace, the branch, main's version). A click
 * outside or Escape closes it; choosing in it closes it through `close`.
 */
export function Dropdown({ label, button, title, highlight = false, width = 'w-[26rem]', children }: {
  /** What the part says to a screen reader: "Branch: login-page". */
  label: string
  button: ReactNode
  title?: string
  /** Marked while it is not where the view usually is (an older version). */
  highlight?: boolean
  width?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div ref={box} className="relative min-w-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={title} onClick={() => setOpen(o => !o)}
        className={`flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-small not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${highlight ? 'bg-warning/15 text-text-primary' : 'text-text-primary'}`}>
        {button}
        <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
      </button>
      {open && (
        <div className={`absolute left-0 z-40 mt-1 ${width} max-w-[90vw] rounded-xl border border-border bg-popover p-1 shadow-pop`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
