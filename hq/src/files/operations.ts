import { HttpError } from 'wasp/server'
import { readFileRef, isSiteFileRef, type FileOpenAnswer, type SiteFileRef } from '@agenthix/core'
import { openFile } from './openFile'
import { openFileDeps } from './openFileDeps'
import { MAX_FILES_PER_OPEN, openFiles, readFileRefs, withOrgOwner } from './openFiles'
import { fileFacts, type FileFactsAnswer } from './fileFacts'
import { openTaskAttachment } from './openTaskAttachment'
import { openTaskAttachmentDeps } from './openTaskAttachmentDeps'
import { taskReferenceFacts } from './taskReferenceFacts'
import { taskReferenceFactsDeps } from './taskReferenceFactsDeps'
import type { TaskReferenceAnswer } from './taskReferenceAnswer'
import { readTaskReference } from '../shared/taskReferences'

type Ctx = { user?: { id: string } }

/** Core declares some of these shapes as interfaces, which Wasp's serializable check does not accept; the same shapes as plain types. */
type Plain<T> = T extends object ? { [K in keyof T]: Plain<T[K]> } : T
export type OpenFileArgs = Plain<{ file: SiteFileRef }>
export type OpenFileAnswer = Plain<FileOpenAnswer>
export type OpenFilesArgs = Plain<{ files: SiteFileRef[] }>
export type OpenFilesAnswer = Plain<{ answers: FileOpenAnswer[] }>
export type FileFactsArgs = Plain<{ files: SiteFileRef[] }>
export type FileFactsResult = Plain<{ answers: FileFactsAnswer[] }>
export type OpenTaskAttachmentArgs = { attachmentId: string }
export type TaskReferenceFactsArgs = { references: string[] }
export type TaskReferenceFactsResult = Plain<{ answers: TaskReferenceAnswer[] }>

/**
 * An action, not a query: each call signs fresh tickets and records each one (T11), so it must never be cached and
 * refetched as a query is, which would hand out links that have expired or record openings nobody made. It is refused
 * while hq is read-only, as every action is.
 */
export const openFileAction = async (args: OpenFileArgs, context: Ctx): Promise<OpenFileAnswer> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const file = readFileRef(withOrgOwner(args?.file))
  if (!file || !isSiteFileRef(file)) {
    throw new HttpError(400, "That isn't a file HQ can open: it names no file in a place, an artefact or a knowledge page. Nothing was changed.")
  }
  return openFile(file, context.user.id, openFileDeps)
}

/**
 * Every file embedded on a screen, opened at once: one request for all of them, each through the same open as
 * `openFileAction` (checked, recorded and signed one by one), the answers in the order asked.
 */
export const openFilesAction = async (args: OpenFilesArgs, context: Ctx): Promise<OpenFilesAnswer> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const refs = readFileRefs(args?.files)
  return { answers: await openFiles(refs, context.user.id, (ref, userId) => openFile(ref, userId, openFileDeps)) }
}

/**
 * What chips show of the files they name, up to `MAX_FILES_PER_OPEN` at once: each file's facts, or why there are
 * none. A query, unlike the open: it signs no ticket and writes no record, so it is safe to cache, refetch and answer
 * while hq is read-only.
 */
export const getFileFactsQuery = async (args: FileFactsArgs, context: Ctx): Promise<FileFactsResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const refs = readFileRefs(args?.files)
  return { answers: await fileFacts(refs, context.user.id, openFileDeps) }
}

/**
 * A task's attachment, opened beside the task: the same answer as `openFileAction`, for a file hq keeps itself and
 * its relay serves (D18), after the access check `/file-link` applies. An action for the same reason: it signs and
 * records tickets.
 */
export const openTaskAttachmentAction = async (args: OpenTaskAttachmentArgs, context: Ctx): Promise<OpenFileAnswer> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const id = args?.attachmentId
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return { state: 'not-found' }
  return openTaskAttachment(id, context.user.id, openTaskAttachmentDeps)
}

/**
 * What chips naming a task or one of its files show (`tasks/MOP-1`, `tasks/MOP-1/notes.md`,
 * `attachments/MOP-1/a.png`), up to `MAX_FILES_PER_OPEN` at once. A query, as `getFileFacts` is: it signs no ticket
 * and writes no record. A task the person may not see answers `not-found`, as one that does not exist does.
 */
export const getTaskReferenceFactsQuery = async (args: TaskReferenceFactsArgs, context: Ctx): Promise<TaskReferenceFactsResult> => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const references = args?.references
  if (!Array.isArray(references) || references.length === 0 || references.length > MAX_FILES_PER_OPEN) {
    throw new HttpError(400, `Tasks are asked about 1 to ${MAX_FILES_PER_OPEN} at a time. Nothing was changed.`)
  }
  const refs = references.map(r => {
    const ref = readTaskReference(r)
    if (!ref) throw new HttpError(400, "That isn't a task or a task's file: write tasks/<task>, tasks/<task>/<path> or attachments/<task>/<file name>. Nothing was changed.")
    return ref
  })
  return { answers: await taskReferenceFacts(refs, context.user.id, taskReferenceFactsDeps) }
}
