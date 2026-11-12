import { useAction, setPersonName } from 'wasp/client/operations'
import { InlineEdit, FOCUS_RING } from '@agenthix/ui/primitives'

/** The Profile block of one person: name edited in place, the picture with Change (the picture picker), and their local time. */
export function PersonProfileFacts({ person, canEdit, localTime, onChangePicture }: {
  person: { userId: string; name: string; avatarUrl: string | null }
  canEdit: boolean
  localTime: string | null
  onChangePicture?: () => void
}) {
  const setName = useAction(setPersonName)
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
        {canEdit && onChangePicture && (
          <>
            {' · '}
            <button type="button" onClick={onChangePicture} className={`rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Change</button>
          </>
        )}
      </dd>
      {localTime && (<><dt className="text-small text-text-muted">Local time</dt><dd className="text-text-secondary">{localTime}</dd></>)}
    </dl>
  )
}
