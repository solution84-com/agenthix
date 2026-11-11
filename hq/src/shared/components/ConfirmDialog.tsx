import { createPortal } from 'react-dom'
import { Button } from '@agenthix/ui/primitives'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-scrim backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative z-10 w-80 rounded-xl border border-border bg-popover p-5 shadow-pop"
        onMouseDown={e => e.stopPropagation()}
      >
        <h3 className="text-h3 font-medium text-text-primary">{title}</h3>
        {description && (
          <p className="mt-1.5 text-small text-text-muted leading-relaxed">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
          <Button type="button" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
