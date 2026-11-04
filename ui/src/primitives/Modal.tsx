import { type ReactNode, useEffect, useId, useRef } from 'react'

// Open modals, innermost last: only the innermost answers Escape and holds Tab.
const openModals: symbol[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
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
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE)
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
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
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
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <h2 id={titleId} className="text-h2 font-semibold text-text-primary">{title}</h2>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export { Modal as ModalDialog }
