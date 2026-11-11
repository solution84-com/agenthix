import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'
import { DOCK_BUTTON } from './dockStyles'

/**
 * The chat's overlays (the Conversations list, a pinned place's conversations, a new conversation, and on a phone the
 * menu): one dark layer over the whole app, and the overlay on it — floating where the panel is, or on a phone a
 * sheet from the bottom. A tap anywhere on the layer, ✕ or Esc closes it and nothing changes; ‹, where given, goes
 * back to the menu it came from. Drawn into the page's body, so nothing in the frame can sit above it.
 */
export function DockLayer({ label, heading, actions, narrow, onClose, onBack, children }: {
  label: string
  /** The overlay's title, at the top. */
  heading: ReactNode
  /** Beside the title, before ✕. */
  actions?: ReactNode
  narrow: boolean
  onClose: () => void
  onBack?: () => void
  children: ReactNode
}) {
  const surface = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  // Read while drawing, before anything inside takes the caret: where it goes back to on closing.
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement)
  useEffect(() => {
    const before = opener.current
    // What is inside may have taken the caret already (a new conversation's box): it keeps it.
    if (!surface.current?.contains(document.activeElement)) surface.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, [])
  const place = narrow
    ? 'inset-x-0 bottom-0 top-16 rounded-t-2xl'
    : 'bottom-3 right-14 top-3 w-[min(26rem,calc(100vw-5rem))] rounded-xl border border-border'
  return createPortal(
    <div data-dock-layer className="pointer-events-none fixed inset-0 z-50">
      <div data-testid="dock-scrim" aria-hidden onClick={() => close.current()} className={`pointer-events-auto absolute inset-y-0 left-0 bg-scrim ${narrow ? 'right-0' : 'right-14'}`} />
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`pointer-events-auto absolute flex flex-col overflow-hidden bg-surface-0 shadow-pop outline-none ${place}`}
      >
        {narrow && <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />}
        <header className="flex shrink-0 items-center gap-1 px-3 pb-2 pt-3">
          {onBack && (
            <button type="button" aria-label="Back to the menu" title="Back to the menu" onClick={onBack} className={DOCK_BUTTON}>
              <ChevronLeft size={16} aria-hidden />
            </button>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2 text-body font-medium text-text-primary">{heading}</div>
          {actions}
          <button type="button" aria-label="Close" title="Close (Esc)" onClick={() => close.current()} className={DOCK_BUTTON}>
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
