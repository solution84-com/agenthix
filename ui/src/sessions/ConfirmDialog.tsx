import { createPortal } from 'react-dom'

export interface ConfirmDialogProps {
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
        className="relative z-10 w-80 rounded-2xl border border-border bg-surface-1 p-5 shadow-2xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <h3 className="text-h3 font-semibold text-text-primary">{title}</h3>
        {description && (
          <p className="mt-1.5 text-small text-text-muted leading-relaxed">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-small font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-small font-medium transition-colors cursor-pointer ${
              destructive
                ? 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/20'
                : 'bg-accent/20 text-accent hover:bg-accent/30 border border-accent/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
