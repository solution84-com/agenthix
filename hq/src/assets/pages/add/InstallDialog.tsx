import { useEffect, useState } from 'react'
import { useAction, useQuery, previewAssetInstall, installAsset, getLibraryAssets } from 'wasp/client/operations'
import { Button, Input, Modal } from '@agenthix/ui/primitives'
import { messageOf } from '../../components/messageOf'
import type { InstallPreview, InstallResult } from '../../install/types'
import { ReadPackage } from './ReadPackage'
import { TemplateBrings } from './TemplateBrings'
import type { PackageFrom } from './packageSource'
import { NEW_PUBLISHER_WARNING, UNSIGNED_WORDS, dialogState, sourceWords, titleOf } from './installWords'

const titleCase = (slug: string) => slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null
  return <ul className="list-disc space-y-0.5 pl-5 text-small text-text-secondary" data-testid="install-warnings">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
}

/** A skill of the same name from another signer is already here: a different publisher, asked again (board U5). */
function DifferentSigner({ preview, have, onKeep, onGo }: { preview: InstallPreview; have: { identity: string; version: string | null; signer: string }; onKeep: () => void; onGo: () => void }) {
  return (
    <div className="space-y-3 text-body text-text-secondary" data-testid="different-signer">
      <p>You have <strong className="text-text-primary">{have.identity}</strong>{have.version ? ` ${have.version}` : ''}, {have.signer.toLowerCase()}.</p>
      <p>{preview.version} is signed by {preview.signedBy ?? 'someone else'}. That's not the publisher you trusted. Install it only if you know why it changed.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onKeep}>Keep {have.version ?? 'what I have'}</Button>
        <Button variant="secondary" onClick={onGo}>Treat as a new publisher…</Button>
      </div>
    </div>
  )
}

/**
 * Installing a package that has arrived (spec part 3 *The four states*; board U4): the check's result in the state's
 * own words, what installing would do, and one confirmation. Signed by someone trusted installs on a click; someone
 * new asks whether to trust them; unsigned needs *I've read it*; a signature that doesn't match is refused with no
 * override. The fingerprint that was shown is the one that is installed.
 */
export function InstallDialog({ source, onClose, onInstalled }: { source: PackageFrom; onClose: () => void; onInstalled: (result: InstallResult, preview: InstallPreview) => void }) {
  const preview = useAction(previewAssetInstall)
  const install = useAction(installAsset)
  const { data: library } = useQuery(getLibraryAssets)
  const [shown, setShown] = useState<InstallPreview | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [read, setRead] = useState(false)
  const [reading, setReading] = useState(false)
  const [choice, setChoice] = useState<'trust' | 'once'>('trust')
  const [displayName, setDisplayName] = useState('')
  const [newPublisher, setNewPublisher] = useState(false)

  useEffect(() => {
    let live = true
    preview(source).then(p => { if (live) { setShown(p); setDisplayName(p.publisher ? titleCase(p.publisher) : '') } }, err => { if (live) setFailed(messageOf(err)) })
    return () => { live = false }
    // The package is looked at once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (failed && !shown) {
    return (
      <Modal open onClose={onClose} title="Can't install this">
        <p role="alert" className="text-body text-danger">{failed}</p>
        <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
      </Modal>
    )
  }
  if (!shown) {
    return <Modal open onClose={onClose} title="Checking…"><p className="text-body text-text-muted">Checking the package and its signature.</p></Modal>
  }

  const state = dialogState(shown)
  // A Library maintainer may install a new signer's package once, but only an administrator may trust the signer.
  const mayTrust = shown.mayTrust !== false
  const trusting = mayTrust && choice === 'trust'
  const same = library?.rows.find(r => r.kind === 'skill' && r.identity.split('/').pop() === shown.name && r.identity !== shown.main.identity)
  if (state === 'new-publisher' && same && !newPublisher) {
    return (
      <Modal open onClose={onClose} title={`${shown.title} ${shown.version} has a different signer`}>
        <DifferentSigner preview={shown} have={same} onKeep={onClose} onGo={() => setNewPublisher(true)} />
      </Modal>
    )
  }

  const go = async () => {
    setBusy(true)
    setFailed(null)
    try {
      const confirm = {
        fingerprint: shown.fingerprint,
        ...(state === 'unsigned' ? { unsignedRead: read } : {}),
        ...(state === 'new-publisher' ? { newPublisher: { choice: trusting ? 'trust' as const : 'once' as const, name: shown.publisher ?? '', displayName: displayName.trim() } } : {}),
      }
      onInstalled(await install({ ...source, confirm }), shown)
    } catch (err) {
      setFailed(messageOf(err))
      setBusy(false)
    }
  }
  const nothingNew = !shown.refusal && (shown.main.outcome === 'same' || shown.main.outcome === 'older') && shown.embedded.length === 0
  const ready = !nothingNew && (state !== 'unsigned' || read) && (state !== 'new-publisher' || displayName.trim().length > 0 || !trusting)
  const what = shown.kind === 'skill' ? `${shown.main.identity} · ${shown.version}` : `${shown.main.identity} · ${shown.version} · ${shown.kind} template`

  return (
    <Modal open onClose={onClose} title={titleOf(shown)} maxWidth="max-w-xl">
      <div className="space-y-3 text-body text-text-secondary" data-testid={`install-${state}`}>
        <p className="text-small text-text-muted">{what} · {sourceWords(shown)}</p>
        {state === 'refused' && <p role="alert" className="text-text-primary">{shown.refusal}</p>}
        {state === 'trusted' && <p className="text-text-primary">✓ {shown.publisher === 'agenthix' && !shown.signedBy ? 'Signed by Agenthix' : `Signed by ${shown.publisher}${shown.signedBy ? ` (${shown.signedBy})` : ''}`}. The signature was checked.</p>}
        {state === 'new-publisher' && (
          <>
            <p>Signed by <strong className="text-text-primary">{shown.signedBy}</strong>. You haven't installed anything from them before. {NEW_PUBLISHER_WARNING}</p>
            {!shown.publisherFixed && mayTrust && (
              <label className="block text-small">Call this publisher
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="mt-1" />
              </label>
            )}
            {!mayTrust && <p className="text-small text-text-muted">Only an administrator can trust a publisher. You can install this once; you'll be asked again next time.</p>}
            <div role="radiogroup" aria-label="Trust" className="space-y-2">
              {mayTrust && <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${choice === 'trust' ? 'border-accent' : 'border-border-subtle'}`}>
                <input type="radio" name="trust" checked={choice === 'trust'} onChange={() => setChoice('trust')} className="mt-1" />
                <span><span className="text-body font-medium text-text-primary">Trust {displayName.trim() || 'this publisher'} and install</span><span className="block text-small text-text-muted">Later versions signed the same way install without asking</span></span>
              </label>}
              <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${!trusting ? 'border-accent' : 'border-border-subtle'}`}>
                <input type="radio" name="trust" checked={!trusting} onChange={() => setChoice('once')} className="mt-1" />
                <span><span className="text-body font-medium text-text-primary">Install this once</span><span className="block text-small text-text-muted">You'll be asked again next time</span></span>
              </label>
            </div>
          </>
        )}
        {state === 'unsigned' && (
          <>
            <p className="text-text-primary">{UNSIGNED_WORDS}</p>
            <label className="flex items-center gap-2 text-body text-text-primary">
              <input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} />
              <span>I've read it</span>
            </label>
          </>
        )}
        {state !== 'refused' && (shown.kind === 'skill' ? <p className="text-small">{shown.summary}</p> : <TemplateBrings preview={shown} />)}
        <Warnings warnings={shown.warnings} />
        {reading && <ReadPackage source={source} />}
        {failed && <p role="alert" className="text-small text-danger">{failed}</p>}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {state === 'refused' ? <Button variant="ghost" onClick={onClose}>Close</Button> : (
            <>
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              {state !== 'trusted' && source.from !== 'shelf' && (
                <Button variant="secondary" onClick={() => setReading(r => !r)}>{reading ? 'Hide it' : state === 'unsigned' ? 'Read it' : 'Read it first'}</Button>
              )}
              <Button disabled={busy || !ready} onClick={() => void go()}>{state === 'new-publisher' && trusting ? `Trust ${displayName.trim() || 'publisher'} and install` : 'Install'}</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
