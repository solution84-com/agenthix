import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

const GAP = 6
const EDGE = 8

/**
 * A button that opens a panel under it. The panel is drawn at the body, above the docked conversation (z-50; the dock is
 * z-20), so no clipping or stacking parent of the button puts it behind. Esc and a click outside close it; choosing in
 * it closes it through `close`.
 */
export function AnchoredMenu({ label, button, highlight = false, width = 352, testId, children }: {
  /** What the button says to a screen reader. */
  label: string
  button: ReactNode
  /** Marked while it asks to be noticed (nobody uses the skill yet). */
  highlight?: boolean
  /** The panel's width in pixels; narrower on a small window. */
  width?: number
  testId?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) { setAt(null); return }
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.min(width, window.innerWidth - EDGE * 2)
    setAt({ left: Math.max(EDGE, Math.min(r.left, window.innerWidth - w - EDGE)), top: r.bottom + GAP })
  }, [open, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} data-testid={testId} onClick={() => setOpen(o => !o)}
        className={`flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-small hover:bg-surface-hover ${highlight ? 'bg-warning/15 text-text-primary' : 'text-text-primary'}`}>
        {button}
        <ChevronDown size={14} aria-hidden className="shrink-0 text-text-muted" />
      </button>
      {open && at && createPortal(
        <div ref={panel} data-testid="anchored-menu" style={{ left: at.left, top: at.top, width }}
          className="fixed z-50 max-h-[70vh] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-pop">
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  )
}
