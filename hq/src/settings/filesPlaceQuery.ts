import type { GetFilesPlace } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { filesPlace } from '../server/files/filesOrigin'

/** Whether uploaded files are downloads only here, for the one line a task's files carry (adr-0114); a fact every member may read. */
export const getFilesPlace: GetFilesPlace<void, { downloadsOnly: boolean }> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  return { downloadsOnly: filesPlace().mode !== 'origin' }
}
