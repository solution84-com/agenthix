/**
 * Generated pictures as a client reads and saves them (ADR-0187, since 1.22): the recipe a picture was drawn from, kept
 * beside its file so the picker can open it again, and one save that changes an avatar, a cover or both.
 */
import type { JsonValue } from './json.js'

/**
 * A picture's recipe as hq stores it: the style and its choices. Only hq's style registry reads `choices`; a client
 * passes the recipe back unchanged or makes a new one with the same registry. Null where the picture was uploaded, or
 * there is none.
 */
export type PictureRecipeView = {
  v: number
  kind: 'avatar' | 'cover'
  style: string
  styleVersion: number
  choices: { [key: string]: JsonValue }
}

/** Whose pictures a save changes; the organisation is its one row, so it is named by kind alone. */
export type PictureSubjectRef =
  | { kind: 'agent'; id: string }
  | { kind: 'person'; id: string }
  | { kind: 'team'; id: string }
  | { kind: 'org' }

/**
 * One picture's change: a recipe hq draws, an upload (a JPEG, PNG or WebP image as a base64 data URL, which hq
 * re-encodes), or a removal. A removal takes a person's avatar back to their initials, and every other picture back to
 * a generated one.
 */
export type PictureChange = { recipe: PictureRecipeView } | { upload: string } | { remove: true }

/** `savePictures`: the avatar, the cover or both, as the picker's Save sends them. At most 30 pictures a minute. */
export type SavePicturesArgs = { subject: PictureSubjectRef; avatar?: PictureChange; cover?: PictureChange }

/** The subject's pictures after the save. */
export type SavePicturesResult = {
  avatarUrl: string | null
  avatarRecipe: PictureRecipeView | null
  coverUrl: string | null
  coverRecipe: PictureRecipeView | null
}
