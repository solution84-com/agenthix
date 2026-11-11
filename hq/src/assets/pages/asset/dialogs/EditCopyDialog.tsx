import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, editLibraryAsset } from 'wasp/client/operations'
import { Button, Input, Modal } from '@agenthix/ui/primitives'
import { messageOf } from '../../../components/messageOf'
import { libraryEditPath } from '../assetPaths'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Editing another publisher's skill makes the organisation's own copy (D18; board U5). Says what happens to the
 * agents, to the original, to the credit and to later versions of the original, before it does any of it.
 */
export function EditCopyDialog({ assetId, title, identity, version, signer, publisherName, onClose }: {
  assetId: string
  title: string
  identity: string
  version: string
  signer: string
  publisherName: string | null
  onClose: () => void
}) {
  const edit = useAction(editLibraryAsset)
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [askName, setAskName] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setFailed(null)
    try {
      const made = await edit({ assetId, ...(askName && name.trim() ? { copyName: name.trim() } : {}) })
      navigate(libraryEditPath(made.assetId))
    } catch (err) {
      const text = messageOf(err)
      setFailed(text)
      setAskName(/another name/i.test(text))
      setBusy(false)
    }
  }
  const copy = `${publisherName ?? 'your organisation'}/${identity.split('/')[1] ?? identity}`
  return (
    <Modal open onClose={onClose} title={`Edit ${title}?`}>
      <div className="space-y-3 text-body text-text-secondary">
        <p>
          {identity} {version} isn't yours ({signer}). Your edits can't carry that signature, so editing makes <strong className="text-text-primary">your own copy</strong>: {copy}, made here.
        </p>
        <p>Your copy takes its place for the agents that have it, when you publish it. The original stays installed, set aside. You can switch back at any time.</p>
        <p>Your copy records that it's based on {identity} {version}. That credit can't be removed.</p>
        <p>When a newer version of the original comes out, you'll see it as news on your copy. It's never merged into your copy by itself.</p>
        {askName && (
          <label className="block text-small">
            Name for your copy
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="my-code-review" className="mt-1" />
          </label>
        )}
        <ShowAttention kind="alert" text={failed} title="The copy was not made" onClose={() => setFailed(null)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => void go()}>Make my copy and edit</Button>
        </div>
      </div>
    </Modal>
  )
}
