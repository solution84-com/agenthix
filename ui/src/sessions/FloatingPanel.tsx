import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * A small panel over the conversation, moving nothing: anchored under its trigger on a desktop, a sheet at the
 * bottom of the screen on a phone. Closes on ✕, Escape or a click outside.
 */
export function FloatingPanel({ title, onClose, children, placement }: {
  title: string
  onClose: () => void
  children: ReactNode
  /** Where it opens from the trigger on a desktop; the parent is the positioning context. */
  placement: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('[data-panel-trigger]')) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown) }
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-40 bg-scrim lg:hidden" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-border bg-surface-1 p-4 pb-6 shadow-xl lg:absolute lg:inset-x-auto lg:bottom-auto lg:w-80 lg:rounded-xl lg:p-3 lg:pb-3 ${placement}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-small font-semibold text-text-primary">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary max-lg:p-2.5">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

/** A label over its value, as the popups list their facts. */
export function PanelFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="text-micro text-text-muted">{label}</p>
      <div className="text-small text-text-primary">{children}</div>
    </div>
  )
}
