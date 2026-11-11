import { useAction, setPersonName } from 'wasp/client/operations'
import { InlineEdit, DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { usePictureActions } from './usePictureActions'
import { useAttentionWhen } from '@agenthix/ui/attention'

/** The Profile block of one person: name edited in place, the picture with Change, and their local time. */
export function PersonProfileFacts({ person, canEdit, localTime }: {
  person: { userId: string; name: string; avatarUrl: string | null }
  canEdit: boolean
  localTime: string | null
}) {
  const setName = useAction(setPersonName)
  const picture = usePictureActions(person.userId)
  const picture_errorDialog = useAttentionWhen(picture.error)
  return (
    <dl className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-body">
      <dt className="text-small text-text-muted">Name</dt>
      <dd className="min-w-0">
        {canEdit ? (
          <InlineEdit
            value={person.name} placeholder="Add a name" textClassName="-mx-3 -my-2"
            onSave={async v => { await setName({ userId: person.userId, displayName: v || null }) }}
          />
        ) : person.name}
      </dd>
      <dt className="text-small text-text-muted">Picture</dt>
      <dd className="text-text-secondary">
        {person.avatarUrl ? 'A picture' : 'Initial on a colour'}
        {canEdit && (
          <>
            <input ref={picture.fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={picture.onFile} aria-label="Choose a picture" />
            {' · '}
            <button type="button" disabled={picture.busy} onClick={picture.choose} className={`rounded text-small font-medium text-link not-disabled:hover:underline ${DISABLED} ${FOCUS_RING}`}>Change</button>
            {person.avatarUrl && (
              <>{' · '}<button type="button" disabled={picture.busy} onClick={picture.remove} className={`text-small text-text-muted not-disabled:hover:text-text-secondary ${DISABLED}`}>Remove</button></>
            )}
          </>
        )}
        {picture_errorDialog}
      </dd>
      {localTime && (<><dt className="text-small text-text-muted">Local time</dt><dd className="text-text-secondary">{localTime}</dd></>)}
    </dl>
  )
}
