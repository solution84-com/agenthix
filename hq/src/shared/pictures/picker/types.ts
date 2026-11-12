/** What a surface hands the picker: whose pictures, what is saved, and how to save. */
import type { PictureChange, PictureRecipeView } from '@agenthix/core'
import type { SubjectKind } from '../recipe'
import type { PickerTab } from './pickerState'

export interface PickerSubject {
  kind: SubjectKind
  name: string
  /** Under the name in the preview card: an agent's role, "Member", "Team". */
  role?: string | null
  isKernel?: boolean
}

export interface PickerPictures {
  avatarUrl: string | null
  avatarRecipe?: PictureRecipeView | null
  coverUrl: string | null
  coverRecipe?: PictureRecipeView | null
}

export type PictureChanges = { avatar?: PictureChange; cover?: PictureChange }

export interface PicturePickerProps {
  subject: PickerSubject
  saved: PickerPictures
  /** The tab it opens on: the cover when the cover was clicked. */
  initialTab?: PickerTab
  onClose: () => void
  /** Sends the changes; the picker closes once it resolves, and says why, still open with its choices, when it throws. */
  save: (changes: PictureChanges) => Promise<void>
}
