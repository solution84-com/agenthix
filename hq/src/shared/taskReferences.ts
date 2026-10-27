/**
 * How an agent names a task, or one of a task's files, in a conversation (spec part 3, *Chips in conversations ›
 * Tasks and their files*): `tasks/MOP-1` for the task, `tasks/MOP-1/notes.md` for a file in its folder (where its
 * runs work), `attachments/MOP-1/screenshot.png` for one of its attachments. A task goes by its key or its id. Unlike
 * a file's reference, these are not read in the conversation's place: a task is found by key across the organisation,
 * and the person's access decides what a chip shows. Shared by the chips and the query that answers them.
 */
import { MAX_FILE_PATH_LENGTH } from '@agenthix/core'

export type TaskReference =
  | { kind: 'task'; task: string }
  | { kind: 'working'; task: string; path: string }
  | { kind: 'attachment'; task: string; name: string }

export const TASK_KEY = /^[A-Z]{2,6}-\d{1,9}$/
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_NAME = 255

/** Whether `value` can be a task's key (`MOP-1`) or its id. */
export function isTaskName(value: string): boolean {
  return TASK_KEY.test(value) || TASK_ID.test(value)
}

const plainPart = (p: string) => p.length > 0 && p !== '.' && p !== '..' && !p.includes('\\') && !p.includes('\0')

/** The task, working file or attachment a reference's parts name, or null for anything else. */
export function taskReferenceOf(parts: readonly string[]): TaskReference | null {
  const [root, task, ...rest] = parts
  if ((root !== 'tasks' && root !== 'attachments') || !task || !isTaskName(task)) return null
  if (!rest.every(plainPart)) return null
  if (root === 'attachments') {
    return rest.length === 1 && rest[0].length <= MAX_NAME ? { kind: 'attachment', task, name: rest[0] } : null
  }
  if (rest.length === 0) return { kind: 'task', task }
  const path = rest.join('/')
  return path.length <= MAX_FILE_PATH_LENGTH ? { kind: 'working', task, path } : null
}

/** A reference read from its written form (`tasks/MOP-1/notes.md`), or null. */
export function readTaskReference(reference: unknown): TaskReference | null {
  if (typeof reference !== 'string' || reference.length > MAX_FILE_PATH_LENGTH + 64) return null
  return taskReferenceOf(reference.split('/').filter(Boolean))
}

/** The reference's written form. */
export function writeTaskReference(ref: TaskReference): string {
  switch (ref.kind) {
    case 'task': return `tasks/${ref.task}`
    case 'working': return `tasks/${ref.task}/${ref.path}`
    case 'attachment': return `attachments/${ref.task}/${ref.name}`
  }
}

/**
 * A file name as a reference writes it: the characters that would end a reference in text (spaces, brackets, quotes)
 * and `%` itself percent-encoded, so `my notes.md` is `my%20notes.md` and reads back whole.
 */
export function referencePart(name: string): string {
  return name.replace(/[\s<>()[\]{}"'`%]/g, c => encodeURIComponent(c).replace(/[()'!*]/g, x => `%${x.charCodeAt(0).toString(16).toUpperCase()}`))
}

/** An attachment's reference, as the agent's task tools answer it. */
export function attachmentReference(taskKey: string, fileName: string): string {
  return `attachments/${taskKey}/${referencePart(fileName)}`
}
