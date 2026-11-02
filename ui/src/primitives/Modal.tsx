import { type ReactNode, useEffect, useId } from 'react'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" onClick={onClose} />
      <div
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
