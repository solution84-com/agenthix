import { useState } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { FleetAdmin } from '../../api/session'
import { GIVE_COMMAND, removeRole } from './useFleetAdmins'

const Command = () => <code className="font-mono text-[.92em]">{GIVE_COMMAND}</code>

/**
 * Removing the role, after saying what happens to them. The last fleet admin cannot remove themselves here (HQ
 * refuses it too): the dialog says what to do instead.
 */
export function RemoveRoleModal({ admin, isMe, onlyOne, onClose, onRemoved }: {
  admin: FleetAdmin; isMe: boolean; onlyOne: boolean; onClose: () => void; onRemoved: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  if (onlyOne) {
    const title = isMe ? 'You are the only fleet admin' : `${admin.name} is the only fleet admin`
    return (
      <Modal open onClose={onClose} title={title}>
        <section aria-label={title} className="space-y-2 text-body text-text-primary">
          <p>Give someone else the role first: without a fleet admin, nobody can sign in to the Fleet Console.</p>
          <p className="text-small text-text-secondary">If nobody holds the role, a machine admin of HQ's machine gives it again with <Command />.</p>
          <div className="flex justify-end pt-2"><Button variant="secondary" onClick={onClose}>Close</Button></div>
        </section>
      </Modal>
    )
  }

  const title = `Remove the fleet admin role from ${admin.name}?`
  const remove = () => {
    setBusy(true)
    setRefusal(null)
    removeRole(admin.id)
      .then(onRemoved)
      .catch((err: unknown) => { setBusy(false); setRefusal(err instanceof Error ? err.message : String(err)) })
  }
  return (
    <Modal open onClose={onClose} title={title}>
      <section aria-label={title} className="space-y-2 text-body text-text-primary">
        <p>
          {isMe ? 'You are' : 'They are'} signed out here at once, including any remote session, and can no longer sign in.
          {' '}Their HQ account stays as it is. What they did stays in Activity under their name.
        </p>
        <p className="text-small text-text-secondary">
          You cannot remove the last fleet admin here. If nobody holds the role, a machine admin of HQ's machine gives it again with <Command />.
        </p>
        {refusal && <p className="text-small text-danger">{refusal}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={remove}>Remove the role</Button>
        </div>
      </section>
    </Modal>
  )
}
