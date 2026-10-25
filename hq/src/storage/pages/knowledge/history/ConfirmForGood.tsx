import { Button, Modal } from '@agenthix/ui/primitives'

/** The one asking step before something is removed at once, with no way back. */
export function ConfirmForGood({ open, title, what, busy, onConfirm, onCancel }: {
  open: boolean
  title: string
  what: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div data-testid="confirm-for-good" className="space-y-4">
        <p className="text-body text-text-secondary">{what}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} className="max-lg:min-h-10">Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={onConfirm} className="max-lg:min-h-10">Delete permanently</Button>
        </div>
      </div>
    </Modal>
  )
}
