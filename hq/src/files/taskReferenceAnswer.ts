import type { LocationRef } from '@agenthix/core'
import type { FileFactsAnswer } from './fileFactsAnswer'

/** What a task chip shows of its task: never asked for, and never answered, for a task the person can't see. */
export type TaskFacts = { id: string; key: string; title: string; state: string }

/**
 * What a chip naming a task, or one of its files, is told (`getTaskReferenceFacts`): no link, so nothing to sign or
 * record. `not-found` alike for no such task and a task the person may not see, so it never says which.
 */
export type TaskReferenceAnswer =
  | { state: 'not-found' }
  | { state: 'site-unavailable' }
  | { state: 'task'; task: TaskFacts }
  /** A file in the task's folder; `loc` null for a task of Your space, which has no folder to open by task. */
  | { state: 'working'; task: TaskFacts; loc: LocationRef | null; path: string; file: FileFactsAnswer }
  /** One of its attachments; `attachmentId` null when it has none by that name. */
  | { state: 'attachment'; task: TaskFacts; attachmentId: string | null; file: FileFactsAnswer }
