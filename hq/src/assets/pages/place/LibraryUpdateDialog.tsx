import { useQuery, getPlaceSkillLibraryUpdate, updatePlaceSkillFromLibrary } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { AssetChanges } from '../../components/AssetChanges'
import type { PlaceSkillUpdateView } from '../../places/libraryUpdate'
import { useAct } from './useAct'

/**
 * *Update…* on a skill added from the Library (F3; board P1): what the Library's newer version would change in the
 * place's files, shown first, then written as the skill's next version. An offer, never applied by itself.
 */
export function LibraryUpdateDialog({ placeSkillId, name, onClose }: { placeSkillId: string; name: string; onClose: () => void }) {
  const { data, error: readError, isLoading } = useQuery(getPlaceSkillLibraryUpdate, { placeSkillId }, { retry: false })
  const update = data as PlaceSkillUpdateView | undefined
  const { busy, error, run } = useAct()
  const confirm = async () => {
    if (!update) return
    const done = await run(() => updatePlaceSkillFromLibrary({ placeSkillId, version: update.to, fingerprint: update.fingerprint }).then(() => true))
    if (done) onClose()
  }
  return (
    <Modal open onClose={onClose} title={update ? `Update ${name} to ${update.to}?` : `Update ${name}`} maxWidth="max-w-2xl">
      <div className="space-y-3" data-testid="place-skill-update">
        {isLoading && <p className="text-small text-text-muted">Reading the files…</p>}
        {readError && <p role="alert" className="text-small text-danger">{readError.message}</p>}
        {update && (
          <>
            <p className="text-small text-text-secondary">
              It was added from {update.identity} {update.from}. Updating writes {update.to} over the skill's folder as its next version.
              Anything changed here since is replaced; published versions stay in its history.
            </p>
            {!update.current && (
              <p role="status" className="rounded-lg bg-surface-2 px-3 py-2 text-small text-text-secondary">
                The folder changed since the page last looked. Look at the files again before updating.
              </p>
            )}
            {update.files.length === 0
              ? <p className="text-small text-text-muted">The files would stay as they are.</p>
              : <div className="max-h-[60vh] overflow-auto"><AssetChanges files={update.files} /></div>}
          </>
        )}
        {error && <p role="alert" className="text-small text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={busy || !update || !update.current}>{update ? `Update to ${update.to}` : 'Update'}</Button>
        </div>
      </div>
    </Modal>
  )
}
