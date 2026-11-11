import { useQuery, getPlaceSkillLibraryUpdate, updatePlaceSkillFromLibrary } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { AssetChanges } from '../../components/AssetChanges'
import type { PlaceSkillUpdateView } from '../../places/libraryUpdate'
import { useAct } from './useAct'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

/**
 * *Update…* on a skill added from the Library (F3; board P1): what the Library's newer version would change in the
 * place's files, shown first, then written as the skill's next version. An offer, never applied by itself.
 */
export function LibraryUpdateDialog({ placeSkillId, name, onClose }: { placeSkillId: string; name: string; onClose: () => void }) {
  const { data, error: readError, isLoading } = useQuery(getPlaceSkillLibraryUpdate, { placeSkillId }, { retry: false })
  const update = data as PlaceSkillUpdateView | undefined
  const { busy, error, run, clear } = useAct()
  const confirm = async () => {
    if (!update) return
    const done = await run(() => updatePlaceSkillFromLibrary({ placeSkillId, version: update.to, fingerprint: update.fingerprint }).then(() => true))
    if (done) onClose()
  }
  return (
    <Modal open onClose={onClose} title={update ? `Update ${name} to ${update.to}?` : `Update ${name}`} maxWidth="max-w-2xl">
      <div className="space-y-3" data-testid="place-skill-update">
        {isLoading && <p className="text-small text-text-muted">Reading the files…</p>}
        {readError && <ReadFailure what="The update" error={readError} />}
        {update && (
          <>
            <p className="text-small text-text-secondary">
              It was added from {update.identity} {update.from}. Updating writes {update.to} over the skill's folder as its next version.
              Anything changed here since is replaced; published versions stay in its history.
            </p>
            {update.files.length === 0
              ? <p className="text-small text-text-muted">The files would stay as they are.</p>
              : <div className="max-h-[60vh] overflow-auto"><AssetChanges files={update.files} /></div>}
          </>
        )}
        <ShowAttention text={error} title="The Library was not updated" onClose={clear} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || !update} refusal={update && !update.current ? { reason: 'The folder changed since the page last looked.', title: 'The folder changed', detail: 'The folder changed since the page last looked. Look at the files again before updating.' } : undefined}>{update ? `Update to ${update.to}` : 'Update'}</Button>
        </div>
      </div>
    </Modal>
  )
}
