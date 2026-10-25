/**
 * Why a file tool refused, from a fixed set. What a person or a model is told is only the fixed message for the reason
 * (and, for a passage found more than once, how many times): never a path, a system error or anything else that would
 * give the system away. What went wrong in detail goes to the caller's log, as `detail`.
 */
import { NotFoundError, PathChangedError } from './verifiedFs.js'

export const FILE_TOOL_REFUSALS = {
  'invalid-name': 'That is not a name these tools take. Give a file\'s name inside the folder, such as notes/today.md. Nothing was changed.',
  'outside-root': 'That name leads outside the folder: a name may not start with / or a drive, or contain "..". Give a name inside the folder. Nothing was changed.',
  link: 'That name passes through a link, and these tools never follow links. Give the name of the file itself. Nothing was changed.',
  'not-found': 'There is no file by that name. Search for it, or check the spelling. Nothing was changed.',
  'not-a-file': 'That name, or a part of it, is a folder where a file is expected or a file where a folder is expected. Check the name. Nothing was changed.',
  binary: 'That file is not text, so these tools cannot read or change it. Nothing was changed.',
  'too-large': 'That file is larger than these tools take (10 MB). Nothing was changed.',
  'invalid-argument': 'An argument is not what this tool takes: offset is a whole number from 0, limit a whole number from 1, and content text. Nothing was changed.',
  changed: 'The file changed since it was read. Read it again, then make the change on what it says now. Nothing was changed.',
  exists: 'A file by that name already exists. Read it first, then change it. Nothing was changed.',
  'edit-not-found': 'old_string was not found. Read the file again and copy the passage exactly, with its spaces and line breaks. Nothing was changed.',
  'edit-ambiguous': 'old_string was found more than once. Give more of the text around it so it is found once, or set replace_all. Nothing was changed.',
  'edit-no-change': 'old_string and new_string are the same, so there is nothing to change. Nothing was changed.',
  'edit-empty': 'old_string is empty. Give the exact passage to replace, or write the whole file instead. Nothing was changed.',
  failed: 'The file could not be read or written. Try again; if it keeps failing, whoever runs this installation can find why in its log. Nothing was changed.',
} as const

export type FileToolRefusal = keyof typeof FILE_TOOL_REFUSALS

/** A refusal. `detail` is for the log only and is never shown. */
export type Refused = { ok: false; reason: FileToolRefusal; count?: number; detail?: string }

export function refusalMessage(reason: FileToolRefusal, count?: number): string {
  if (reason === 'edit-ambiguous' && count !== undefined) {
    return `old_string was found ${count} times. Give more of the text around it so it is found once, or set replace_all. Nothing was changed.`
  }
  return FILE_TOOL_REFUSALS[reason]
}

export function refused(reason: FileToolRefusal, detail?: unknown): Refused {
  if (detail === undefined) return { ok: false, reason }
  return { ok: false, reason, detail: detail instanceof Error ? `${detail.name}: ${detail.message}` : String(detail) }
}

/** A failure thrown by the safe-open helpers, as a refusal. */
export function refusalFor(err: unknown): Refused {
  if (err instanceof NotFoundError) return refused('not-found', err)
  if (err instanceof PathChangedError) return refused('link', err)
  const code = (err as NodeJS.ErrnoException | undefined)?.code
  if (code === 'ENOTDIR' || code === 'EISDIR') return refused('not-a-file', err)
  if (code === 'ENOENT') return refused('not-found', err)
  if (code === 'EFBIG') return refused('too-large', err)
  return refused('failed', err)
}
