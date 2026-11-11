import { useState } from 'react'
import { useAction, previewAssetInstall, installAssetVersionOnPurpose } from 'wasp/client/operations'
import { Button, Modal, Textarea } from '@agenthix/ui/primitives'
import { messageOf } from '../../../components/messageOf'
import { PackagePicker } from '../../add/PackagePicker'
import { NO_UPLOAD, hasUpload, uploadFrom, type PackageFrom, type UploadChoice } from '../../add/packageSource'
import type { InstallPreview } from '../../../install/types'
import type { AssetPageView } from '../pageTypes'
import { ShowAttention } from '@agenthix/ui/attention'

const WITHDRAWN = /^The publisher withdrew /

/**
 * Any version on purpose (V3, D30): a particular version of a skill already installed, newer or older, from a package
 * at hand. It goes through the same check as any install, names the fingerprint shown, needs a reason, and says
 * plainly when it goes back. A version its publisher withdrew needs its warning accepted.
 */
export function OnPurposeDialog({ page, onClose, onDone }: { page: AssetPageView; onClose: () => void; onDone: (message: string) => void }) {
  const preview = useAction(previewAssetInstall)
  const install = useAction(installAssetVersionOnPurpose)
  const [upload, setUpload] = useState<UploadChoice>(NO_UPLOAD)
  const [source, setSource] = useState<PackageFrom | null>(null)
  const [shown, setShown] = useState<InstallPreview | null>(null)
  const [reason, setReason] = useState('')
  const [read, setRead] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const onShelf = page.identity.startsWith('agenthix/')

  const look = async (from: PackageFrom) => {
    setBusy(true)
    setFailed(null)
    try {
      const looked = await preview(from)
      if (looked.main.existingId !== null && looked.main.existingId !== page.assetId) {
        setFailed(`That package is ${looked.main.identity}, not ${page.identity}. Choose a package of ${page.identity}. Nothing was changed.`)
        setBusy(false)
        return
      }
      setShown(looked)
      setSource(from)
    } catch (err) {
      setFailed(messageOf(err))
    }
    setBusy(false)
  }
  const go = async () => {
    if (!source || !shown) return
    setBusy(true)
    setFailed(null)
    try {
      const made = await install({ ...source, confirm: { assetId: page.assetId, fingerprint: shown.fingerprint, reason, unsignedRead: read, withdrawnAccepted: accepted } } as Parameters<typeof install>[0])
      onDone(made.message)
    } catch (err) {
      setFailed(messageOf(err))
      setBusy(false)
    }
  }
  const older = shown?.main.outcome === 'older'
  const withdrawn = failed !== null && WITHDRAWN.test(failed)

  return (
    <Modal open onClose={onClose} title={`Install another version of ${page.title}`} maxWidth="max-w-xl">
      <div className="space-y-3 text-body text-text-secondary" data-testid="on-purpose">
        {!shown ? (
          <>
            <p>Choose a package of {page.identity}. It is checked as any install is, and the version in use moves to it at once.</p>
            {onShelf && <Button variant="secondary" disabled={busy} onClick={() => void look({ from: 'shelf', name: page.identity.split('/')[1]! })}>The version on Agenthix's shelf</Button>}
            <PackagePicker value={upload} onChange={setUpload} />
            <Button variant="secondary" disabled={busy || !hasUpload(upload)} onClick={() => void (async () => look(await uploadFrom(upload)))()}>Check it</Button>
          </>
        ) : (
          <>
            <p className="text-text-primary">{shown.main.identity} {shown.version}{shown.signedBy ? ` · signed by ${shown.signedBy}` : ''}</p>
            {shown.refusal ? <p role="alert" className="text-danger">{shown.refusal}</p> : (
              <>
                {older && <p className="text-text-primary">This is older than the one you have ({shown.main.installedVersion}).</p>}
                <label className="block text-small">Why this version (kept in the history)
                  <Textarea rows={2} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} className="mt-1" />
                </label>
                {shown.needs.unsignedRead && (
                  <label className="flex items-center gap-2 text-text-primary"><input type="checkbox" className="accent-accent" checked={read} onChange={e => setRead(e.target.checked)} /><span>I've read it</span></label>
                )}
                {withdrawn && (
                  <label className="flex items-center gap-2 text-text-primary"><input type="checkbox" className="accent-accent" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>I want it anyway</span></label>
                )}
              </>
            )}
          </>
        )}
        <ShowAttention text={failed} title="It was not installed" onClose={() => setFailed(null)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {shown && !shown.refusal && (
            <Button disabled={busy || !reason.trim() || (shown.needs.unsignedRead && !read) || (withdrawn && !accepted)} onClick={() => void go()}>
              {older ? `Return to ${shown.version}` : `Use ${shown.version}`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
