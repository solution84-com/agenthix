/** Save's two pure halves: the edits made into what is sent, and what a failure says. */
import type { PictureChange, PictureRecipeView } from '@agenthix/core'
import type { PictureKind } from '../recipe'
import { NOT_READABLE, TOO_LARGE_TO_SEND, cropAndCompress } from '../upload/cropAndCompress'
import type { PictureEdit } from './pickerState'
import type { PictureChanges } from './types'

/** An upload is cut and compressed here, on Save, so only the frame's part of the picture is sent. */
async function changeOf(edit: PictureEdit, kind: PictureKind): Promise<PictureChange> {
  if ('remove' in edit) return { remove: true }
  if ('recipe' in edit) return { recipe: edit.recipe as unknown as PictureRecipeView }
  return { upload: await cropAndCompress(edit.upload.file, kind, { crop: edit.upload.crop }) }
}

export async function changesToSend(edits: { avatar?: PictureEdit; cover?: PictureEdit }): Promise<PictureChanges> {
  const [avatar, cover] = await Promise.all([
    edits.avatar ? changeOf(edits.avatar, 'avatar') : undefined,
    edits.cover ? changeOf(edits.cover, 'cover') : undefined,
  ])
  return { ...(avatar ? { avatar } : {}), ...(cover ? { cover } : {}) }
}

const BROWSER_WORDS = [NOT_READABLE, TOO_LARGE_TO_SEND]

/**
 * What a failed Save says: HQ's own refusal (a 4xx says why: not a picture, too large, too many saves, not allowed) or
 * the browser's, and plain words for anything else, since they say nothing the person can act on.
 */
export function saveFailureWords(err: unknown): string {
  const status = (err as { statusCode?: unknown } | null)?.statusCode
  const message = err instanceof Error ? err.message : ''
  if (typeof status === 'number' && status >= 400 && status < 500 && message) return message
  if (status === undefined && BROWSER_WORDS.includes(message)) return message
  return 'Nothing was changed. Your choices are still here, so you can try again.'
}
