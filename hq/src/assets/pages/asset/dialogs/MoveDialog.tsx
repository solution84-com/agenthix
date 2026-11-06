import { useState } from 'react'
import { useAction, acceptAssetUpdate, rollBackAsset } from 'wasp/client/operations'
import { Button, Modal, Textarea } from '@agenthix/ui/primitives'
import { messageOf } from '../../../components/messageOf'

export type MoveTarget = { id: string; version: string; withdrawn: string | null }

/**
 * Moving the version in use: *Update to* a newer one, or *Return to this version* for an earlier one hq holds (V1–V3; board U5).
 * Every agent that has the asset uses it from its next turn; the other version stays in the history. A version its
 * publisher withdrew says why and needs the warning accepted.
 */
export function MoveDialog({ mode, assetId, title, inUse, target, onClose, onDone }: {
  mode: 'update' | 'rollBack'
  assetId: string
  title: string
  inUse: string
  target: MoveTarget
  onClose: () => void
  onDone: (message: string) => void
}) {
  const update = useAction(acceptAssetUpdate)
  const rollBack = useAction(rollBackAsset)
  const [reason, setReason] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const back = mode === 'rollBack'
  const go = async () => {
    setBusy(true)
    setFailed(null)
    try {
      await (back ? rollBack : update)({ assetId, versionId: target.id, reason: reason.trim() || undefined, withdrawnAccepted: accepted })
      onDone(back ? `${title} is back at ${target.version}.` : `${title} is now at ${target.version}.`)
    } catch (err) {
      setFailed(messageOf(err))
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={back ? `Return ${title} to ${target.version}?` : `Update ${title} to ${target.version}?`}>
      <div className="space-y-3 text-body text-text-secondary">
        <p>
          Every agent that uses it uses {target.version} from its next turn. {inUse} stays among its versions, so you can return to it.
        </p>
        {target.withdrawn && (
          <div role="alert" className="rounded-lg border border-warning px-3 py-2 text-small text-text-primary">
            <p>The publisher withdrew {target.version}: {target.withdrawn}</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
              <span>I want {target.version} anyway</span>
            </label>
          </div>
        )}
        <label className="block text-small text-text-secondary">
          Why (optional, kept in the history)
          <Textarea rows={2} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} className="mt-1" />
        </label>
        <p className="text-small text-text-muted">Recorded as: {back ? `returned to ${target.version}` : 'updated'} by you, with the time.</p>
        {failed && <p role="alert" className="text-small text-danger">{failed}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || (target.withdrawn !== null && !accepted)} onClick={() => void go()}>{back ? `Return to ${target.version}` : `Update to ${target.version}`}</Button>
        </div>
      </div>
    </Modal>
  )
}
