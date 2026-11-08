import { type ReactNode, useEffect, useId, useRef } from 'react'
import { XGlyph } from './Glyphs'
import { Tooltip } from './Tooltip'

// Open modals, innermost last: only the innermost answers Escape and holds Tab.
const openModals: symbol[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
  /** A ✕ at the title's right that closes the dialog, named this (its tooltip and accessible name). */
  closeLabel?: string
  /** Drawn before the title in its row, such as the avatar of the agent the dialog is about. */
  titleLead?: ReactNode
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', closeLabel, titleLead }: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const me = Symbol('modal')
    openModals.push(me)
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) {
      // The ✕ is skipped so its tooltip waits for hover or Tab rather than opening with the dialog.
      const first = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).find(el => !el.hasAttribute('data-modal-close'))
      if (first) first.focus()
      else { dialog.tabIndex = -1; dialog.focus() }
    }
    const handler = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== me) return
      if (e.key === 'Escape') { onCloseRef.current(); return }
      if (e.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      const at = openModals.indexOf(me)
      if (at >= 0) openModals.splice(at, 1)
      if (previous && previous.isConnected) previous.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        className={`relative w-full ${maxWidth} bg-surface-1 border border-border rounded-2xl shadow-2xl`}
      >
        {title && (
          <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-border max-sm:px-4">
            {titleLead}
            <h2 id={titleId} className="min-w-0 flex-1 text-h2 font-semibold text-text-primary">{title}</h2>
            {closeLabel && (
              <Tooltip label={closeLabel} side="top">
                <button
                  type="button" aria-label={closeLabel} onClick={onClose} data-modal-close
                  className="-my-2 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent max-sm:h-11 max-sm:w-11"
                >
                  <XGlyph size={18} />
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export { Modal as ModalDialog }
