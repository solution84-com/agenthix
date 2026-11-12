import { useState } from 'react'
import { useAction, setPersonName } from 'wasp/client/operations'
import type { PictureRecipeView } from '@agenthix/core'
import { InlineEdit, FOCUS_RING } from '@agenthix/ui/primitives'
import { PersonFace } from './PersonFace'
import { useDemo } from '../../../demo/useDemo'
import { shownHandle } from './peopleFormat'
import { PicturePicker } from '../../../shared/pictures/picker'
import { useSavePictures } from '../../../shared/pictures/picker/useSavePictures'

type Props = {
  person: { userId: string; name: string; handle: string | null; avatarUrl: string | null; coverUrl?: string | null }
  /** The recipes their pictures were drawn from, for the picker. */
  recipes?: { avatarRecipe?: PictureRecipeView | null; coverRecipe?: PictureRecipeView | null }
  /** The person themselves, or an organisation admin. */
  canEdit: boolean
}

/** A person's name (edited in place) and picture; used in their own Profile. Change picture opens the picker. */
export function PersonNameAndPicture({ person, recipes, canEdit }: Props) {
  const setName = useAction(setPersonName)
  const handle = shownHandle(person, useDemo().on)
  const [picker, setPicker] = useState(false)
  const savePictures = useSavePictures({ kind: 'person', id: person.userId })

  return (
    <div className="flex items-start gap-4">
      <PersonFace person={person} size="lg" />
      <div className="min-w-0 flex-1">
        {canEdit ? (
          <InlineEdit
            value={person.name}
            placeholder="Add a name"
            textClassName="text-h2 font-medium -mx-3 -my-2"
            onSave={async v => { await setName({ userId: person.userId, displayName: v || null }) }}
          />
        ) : (
          <div className="text-h2 font-medium text-text-primary">{person.name}</div>
        )}
        {handle && <div className="text-small text-text-muted">{handle}</div>}
        {canEdit && (
          <div className="mt-2 text-small">
            <button type="button" onClick={() => setPicker(true)} className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>
              {person.avatarUrl ? 'Change picture' : 'Add a picture'}
            </button>
          </div>
        )}
        <PicturePicker
          open={picker} onClose={() => setPicker(false)} save={savePictures}
          subject={{ kind: 'person', name: person.name, role: handle ?? null }}
          saved={{ avatarUrl: person.avatarUrl, avatarRecipe: recipes?.avatarRecipe, coverUrl: person.coverUrl ?? null, coverRecipe: recipes?.coverRecipe }}
        />
      </div>
    </div>
  )
}
