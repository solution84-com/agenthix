/**
 * A task attachment's file name becomes one path segment under the attachment's
 * own folder, is stored as its `fileName`, and ends its URL. Anything other than
 * one plain segment is refused, never rewritten, so all three stay what the
 * caller sent (spec §4.15).
 */
const MAX_FILE_NAME_BYTES = 255

export function attachmentFileNameProblem(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return 'A file name is required'
  if (name === '.' || name === '..') return 'A file name cannot be "." or ".."'
  if (/[/\\]/.test(name)) return 'A file name cannot contain "/" or "\\"'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'A file name cannot contain control characters'
  if (new TextEncoder().encode(name).length > MAX_FILE_NAME_BYTES) {
    return `A file name cannot be longer than ${MAX_FILE_NAME_BYTES} bytes`
  }
  return null
}

/** The largest file a task takes as an attachment; checked in the browser before sending, and again by hq. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_TOO_LARGE = 'Attachments can be up to 10 MB.'
