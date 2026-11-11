import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** The words, or `children` for more than a line. */
  description?: ReactNode
  children?: ReactNode
  /** Named for what it does ("Disconnect office-server"), never "OK". */
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  /** The action is under way: its button waits. */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The confirm dialog: a question before a press that cannot be undone, not an error. Cancel, or the action named for
 * what it does. Escape and a press outside are Cancel.
 */
export function ConfirmDialog({ open, title, description, children, confirmLabel, cancelLabel = 'Cancel', destructive = false, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {description !== undefined && description !== null && <div className="text-body text-text-primary">{description}</div>}
      {children !== undefined && children !== null && <div className={`text-body text-text-primary ${description ? 'mt-3' : ''}`}>{children}</div>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>{cancelLabel}</Button>
        <Button type="button" variant={destructive ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
