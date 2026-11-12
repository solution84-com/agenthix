import { savePictures, queryClientInitialized } from 'wasp/client/operations'
import type { PictureSubjectRef, SavePicturesArgs, SavePicturesResult } from '@agenthix/core'
import type { PictureChanges } from './types'
import { readsOnItsOwn } from '../../../queryClient'

/**
 * Saves pictures, then reads the open views again. `savePictures` declares no entities: Wasp re-reads an action's
 * entities whether it succeeds or fails, and a re-read of the signed-in person while HQ cannot be reached replaces the
 * whole app with an error box (`queryClient.ts`), so the views are read again here, only once the save has landed.
 */
export async function saveAndRefresh(args: SavePicturesArgs): Promise<SavePicturesResult> {
  const result = await savePictures(args)
  // The signed-in person is read again only when it is the one whose picture changed: that read failing replaces the app.
  const person = args.subject.kind === 'person'
  void queryClientInitialized.then(client => client.invalidateQueries({ predicate: query => person || readsOnItsOwn(query) }))
  return result
}

/** The picker's Save for a subject that exists: one `savePictures`, after which the subject's views are read again. */
export function useSavePictures(subject: PictureSubjectRef, after?: (result: SavePicturesResult) => void): (changes: PictureChanges) => Promise<void> {
  return async changes => {
    const result = await saveAndRefresh({ subject, ...changes })
    after?.(result)
  }
}
