import type { ReactNode } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'

export interface ConfirmModalProps {
  open: boolean
  title: string
  children: ReactNode
  /** Named for what it does ("Disconnect office-server"), never "OK". */
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ open, title, children, confirmLabel, destructive = false, busy = false, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-body text-text-primary">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button variant={destructive ? 'danger' : 'primary'} type="button" disabled={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
