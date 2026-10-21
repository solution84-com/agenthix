import { useEffect, useRef, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import { MainNavList } from './mainNav'
import type { PinnedSlot } from './pinnedSlot'
import { SidebarFooter } from './SidebarFooter'

/**
 * The main navigation, with the same foot, shown over the drilled-in panel by ‹ (*Go to*). Choosing an item goes there. Choosing the
 * place you are in, ✕, Esc or a click outside closes it and nothing moves: no navigation, the same section, the
 * same scroll. Focus moves into it, and back to ‹ when it closes.
 */
export function MainNavOverlay({ homePath, pinned, onClose, onOutside }: {
  /** The place the panel is drilled into: a link to it only closes the overlay. */
  homePath: string
  pinned?: PinnedSlot
  onClose: () => void
  /** A click outside; on a small screen it dismisses the drawer too. */
  onOutside: () => void
}) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Runs before the link's own handler, which then leaves a prevented click alone.
  const stayIfHere = (e: MouseEvent) => {
    const link = (e.target as Element).closest('a')
    if (!link) return
    const to = new URL(link.href, window.location.href)
    if (to.pathname === homePath) {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <>
      <div data-testid="main-nav-overlay-backdrop" onClick={onOutside} className="fixed inset-0 z-40 bg-scrim opacity-40" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        onClickCapture={stayIfHere}
        className="fixed inset-y-0 left-0 z-50 w-60 flex flex-col bg-surface-0 border-r border-border-subtle shadow-pop"
      >
        <div className="shrink-0 flex items-center h-14 px-3">
          <span className="flex-1 text-small font-medium uppercase tracking-wide text-text-muted">Go to</span>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-0.5">
          <MainNavList collapsed={false} />
        </div>
        <SidebarFooter collapsed={false} pinned={pinned} />
      </div>
    </>
  )
}
