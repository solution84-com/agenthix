import { type ReactNode, useEffect, useId, useRef } from 'react'
import { XGlyph } from './Glyphs'
import { Tooltip } from './Tooltip'
import { FOCUS_RING } from './controlStyles'

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
  /** `right`: a tall panel from the right edge over the page, for a wide working view; the focus rules are the same. */
  side?: 'center' | 'right'
  /** `sm`: on a screen narrower than that, a centred dialog fills it: no margin, no rounding, full height. */
  fullScreenBelow?: 'sm'
}

// Whole class names, so Tailwind finds them: the backdrop's padding, the dialog's frame, and its body's scroll.
const FULL_BELOW_SM = {
  outer: 'max-sm:p-0',
  dialog: 'max-sm:flex max-sm:h-full max-sm:max-w-none max-sm:flex-col max-sm:rounded-none max-sm:border-0',
  body: 'max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto',
}
const NOT_FULL = { outer: '', dialog: '', body: '' }

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', closeLabel, titleLead, side = 'center', fullScreenBelow }: ModalProps) {
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

  const right = side === 'right'
  const full = !right && fullScreenBelow === 'sm' ? FULL_BELOW_SM : NOT_FULL
  return (
    <div className={`fixed inset-0 z-50 flex ${right ? 'justify-end' : `items-center justify-center p-4 ${full.outer}`}`}>
      <div className={`absolute inset-0 bg-scrim ${right ? '' : 'backdrop-blur-sm'}`} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined}
        className={right
          ? `relative flex h-full w-full ${maxWidth} flex-col border-l border-border bg-popover shadow-pop`
          : `relative w-full ${maxWidth} bg-popover border border-border rounded-xl shadow-pop ${full.dialog}`}
      >
        {title && (
          <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-border max-sm:px-4">
            {titleLead}
            <h2 id={titleId} className="min-w-0 flex-1 text-h2 font-medium text-text-primary">{title}</h2>
            {closeLabel && (
              <Tooltip label={closeLabel} side="top">
                <button
                  type="button" aria-label={closeLabel} onClick={onClose} data-modal-close
                  className={`-my-2 -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary active:bg-surface-pressed ${FOCUS_RING} max-sm:h-11 max-sm:w-11`}
                >
                  <XGlyph size={18} />
                </button>
              </Tooltip>
            )}
          </div>
        )}
        <div className={right ? 'min-h-0 flex-1 overflow-y-auto p-6' : `p-6 ${full.body}`}>{children}</div>
      </div>
    </div>
  )
}

export { Modal as ModalDialog }
