import { useState } from 'react'
import { deletePlaceSecret, deletePlaceVariable, useAction } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { SecretsPlace, UsingWorkflowView, ValueKind } from '../pages/secretsTypes'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Delete a secret or a variable. The server refuses while a workflow that is on names it, listing them; the dialog
 * then offers *Turn off what uses it* first.
 */
export function DeleteDialog({ open, onClose, place, kind, name, usedBy, onTurnOff }: {
  open: boolean
  onClose: () => void
  place: SecretsPlace
  kind: ValueKind
  name: string
  usedBy: UsingWorkflowView[]
  onTurnOff: () => void
}) {
  const removeSecret = useAction(deletePlaceSecret)
  const removeVariable = useAction(deletePlaceVariable)
  const on = usedBy.filter((w) => w.enabled)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const refusedForUse = (error as { data?: { code?: string } } | null)?.data?.code === 'in_use'

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await (kind === 'secret' ? removeSecret : removeVariable)({ place, name })
      onClose()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Delete ${name}?`} maxWidth="max-w-md">
      <div className="space-y-4" data-testid="delete-dialog">
        <p className="text-small text-text-secondary">
          {kind === 'secret' ? 'Its value is destroyed; its record stays.' : 'Its value is removed; its changes stay in the history.'}
          {on.length > 0 && ` ${on.map((w) => w.name).join(', ')} ${on.length === 1 ? 'uses' : 'use'} it and ${on.length === 1 ? 'is' : 'are'} on.`}
        </p>
        <ShowAttention text={error} title="It was not deleted" onClose={() => setError(null)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {(refusedForUse || on.length > 0) && <Button variant="secondary" onClick={() => { onClose(); onTurnOff() }}>Turn off what uses it</Button>}
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>Delete</Button>
        </div>
      </div>
    </Modal>
  )
}
