import { ConfirmDialog } from '@agenthix/ui/primitives'

/** The one asking step before something is removed at once, with no way back: the confirm dialog, with its words. */
export function ConfirmForGood({ open, title, what, busy, onConfirm, onCancel }: {
  open: boolean
  title: string
  what: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <ConfirmDialog open={open} title={title} confirmLabel="Delete permanently" destructive busy={busy} onConfirm={onConfirm} onCancel={onCancel}>
      <p data-testid="confirm-for-good" className="text-text-secondary">{what}</p>
    </ConfirmDialog>
  )
}
