import { useAction, setPersonName } from 'wasp/client/operations'
import { InlineEdit } from '@agenthix/ui/primitives'
import { PersonFace } from './PersonFace'
import { usePictureActions } from './usePictureActions'

type Props = {
  person: { userId: string; name: string; handle: string | null; avatarUrl: string | null }
  /** The person themselves, or an organisation admin. */
  canEdit: boolean
}

/** A person's name (edited in place) and picture; used in their own Profile. */
export function PersonNameAndPicture({ person, canEdit }: Props) {
  const setName = useAction(setPersonName)
  const picture = usePictureActions(person.userId)

  return (
    <div className="flex items-start gap-4">
      <PersonFace person={person} size="lg" />
      <div className="min-w-0 flex-1">
        {canEdit ? (
          <InlineEdit
            value={person.name}
            placeholder="Add a name"
            textClassName="text-h2 font-semibold -mx-3 -my-2"
            onSave={async v => { await setName({ userId: person.userId, displayName: v || null }) }}
          />
        ) : (
          <div className="text-h2 font-semibold text-text-primary">{person.name}</div>
        )}
        {person.handle && <div className="text-small text-text-muted">@{person.handle}</div>}
        {canEdit && (
          <div className="mt-2 flex items-center gap-3 text-small">
            <input ref={picture.fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={picture.onFile} aria-label="Choose a picture" />
            <button type="button" disabled={picture.busy} onClick={picture.choose} className="font-medium text-accent hover:text-accent-hover disabled:opacity-40">
              {person.avatarUrl ? 'Change picture' : 'Add a picture'}
            </button>
            {person.avatarUrl && (
              <button type="button" disabled={picture.busy} onClick={picture.remove} className="text-text-muted hover:text-text-secondary disabled:opacity-40">
                Remove picture
              </button>
            )}
          </div>
        )}
        {picture.error && <p role="alert" className="mt-1 text-small text-danger">{picture.error}</p>}
      </div>
    </div>
  )
}
