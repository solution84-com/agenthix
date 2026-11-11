import { useState } from 'react'
import { useAction, useQuery, getAssetHolders, removeLibraryAsset } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { messageOf } from '../../../components/messageOf'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

/**
 * *Remove*: names what it reaches and asks first (D17; board U3). A skill's agents stop using it; what was made from a
 * template is left as it is. Its history is kept.
 */
export function RemoveDialog({ assetId, title, template = false, onClose, onRemoved }: { assetId: string; title: string; template?: boolean; onClose: () => void; onRemoved: () => void }) {
  const query = useQuery(getAssetHolders, { assetId })
  const { data: holders } = query
  const read = useBackgroundRead(query, { what: 'Who holds it' })
  const remove = useAction(removeLibraryAsset)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const names = holders?.agents.map(a => a.name) ?? []
  const made = holders?.made ?? []
  const who = holders?.everyAgent ? 'Every agent has it.' : names.length === 0 ? 'No agent has it.' : `${names.join(' and ')} ${names.length === 1 ? 'has' : 'have'} it.`
  const consequence = names.length === 0 ? '' : " They'll stop using it on their next turn. Their pages will show it as missing, with Install."
  // A template: nothing has it, but things were made from it, and removing it never changes them (adr-0072).
  const reach = template
    ? made.length === 0 ? 'Nothing has been made from it.' : `${made.map(m => m.name).join(' and ')} ${made.length === 1 ? 'was' : 'were'} made from it. ${made.length === 1 ? 'It stays' : 'They stay'} as ${made.length === 1 ? 'it is' : 'they are'}.`
    : `${who}${consequence}`
  const go = async () => {
    setBusy(true)
    setFailed(null)
    try {
      await remove({ assetId, confirmed: true })
      onRemoved()
    } catch (err) {
      setFailed(messageOf(err))
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Remove ${title}?`}>
      <div className="space-y-3 text-body text-text-secondary">
        {read.failedWithoutData ? read.nudge : !holders ? <p>Loading…</p> : (
          <>
            <p data-testid="remove-reach">{reach}</p>
            <p>{template ? 'Its history is kept, so an administrator can put it back.' : 'Its history is kept, so it can be installed again with its versions and credit.'}</p>
          </>
        )}
        <ShowAttention kind="alert" text={failed} title="The asset was not removed" onClose={() => setFailed(null)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!holders || busy} onClick={() => void go()}>Remove</Button>
        </div>
      </div>
    </Modal>
  )
}
