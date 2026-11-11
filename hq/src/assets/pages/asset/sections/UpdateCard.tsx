import { Button } from '@agenthix/ui/primitives'
import { useState } from 'react'
import { useAction, useQuery, getAssetDiff, getAssetVersions, skipAssetUpdate } from 'wasp/client/operations'
import { AssetChanges } from '../../../components/AssetChanges'
import { PRIMARY_BUTTON, SMALL_BUTTON } from '../../../components/Section'
import { messageOf } from '../../../components/messageOf'
import { MoveDialog } from '../dialogs/MoveDialog'
import type { AssetPageView } from '../pageTypes'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

/**
 * *Update available* (V2; board U5): what changes in the new version, as a difference between the version in use and
 * the new one, file by file. Updating pins it for every agent that has the skill, from their next turn. The signer
 * must stay the same: a version from a different signer is never offered here (spec part 3 *After installing*).
 * *Not now* keeps the mark; *Skip* hides it until a later version (UQ10).
 */
export function UpdateCard({ page, onChanged }: { page: AssetPageView; onChanged: (message: string) => void }) {
  const update = page.update!
  const { data: diff, error } = useQuery(getAssetDiff, { assetId: page.assetId, versionId: update.versionId })
  const { data: versions } = useQuery(getAssetVersions, { assetId: page.assetId })
  const [open, setOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const skip = useAction(skipAssetUpdate)
  const [failed, setFailed] = useState<string | null>(null)
  const skipIt = () => {
    setFailed(null)
    skip({ assetId: page.assetId, version: update.version })
      .then(r => onChanged(`${r.identity} ${r.skipped} is skipped. A later version will be offered when it arrives.`), err => setFailed(messageOf(err)))
  }
  const target = versions?.versions.find(v => v.id === update.versionId)
  if (hidden) return null
  return (
    <section className="rounded-xl border border-border-strong bg-card p-4" aria-label="Update available" data-testid="asset-update">
      <h2 className="text-body font-medium text-text-primary">What changes in {update.version}</h2>
      <div className="mt-3">
        {error ? <ReadFailure what="The update's changes" error={error} /> : !diff ? <p className="text-small text-text-muted">Loading…</p> : <AssetChanges files={diff.files} />}
      </div>
      <p className="mt-3 text-small text-text-secondary">{page.signedBy}, as {page.version} was.</p>
      {page.can.update ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={PRIMARY_BUTTON} disabled={!target} onClick={() => setOpen(true)}>Update to {update.version}</button>
          <button type="button" className={SMALL_BUTTON} onClick={() => setHidden(true)}>Not now</button>
          <button type="button" className={SMALL_BUTTON} onClick={skipIt}>Skip {update.version}</button>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3" refusal={{ reason: 'Updating is for administrators and Library maintainers.', title: 'Updating is not available to you' }}>Update to {update.version}</Button>
      )}
      <ShowAttention text={failed} title="The update was not made" onClose={() => setFailed(null)} />
      {open && target && (
        <MoveDialog mode="update" assetId={page.assetId} title={page.title} inUse={page.version ?? ''} target={{ id: target.id, version: target.version, withdrawn: target.withdrawn }}
          onClose={() => setOpen(false)} onDone={m => { setOpen(false); onChanged(m) }} />
      )}
    </section>
  )
}
