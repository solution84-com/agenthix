/**
 * An epic is never run (spec D12): it groups tasks toward one goal, and its tasks are what run. An agent may manage
 * one (talk it through, write and order its tasks), so an epic may have an agent; but no path starts, queues or claims
 * a run of one. The claim paths leave epics out of their queries (agents/taskSlotClaim.ts); the refusal below gives
 * the words.
 */
import { HttpError } from 'wasp/server'
import type { Prisma } from '@prisma/client'

/** A query's mark for the tasks that are not epics: a task of no type yet is one. */
export const NOT_AN_EPIC = { NOT: { type: { is: { kind: 'EPIC' } } } } satisfies Prisma.TaskWhereInput

export const EPIC_NOT_RUN =
  'An epic is never run: plan it in its conversation or its comments, and run its tasks. Nothing was changed.'

/** `type` is the task's type, by its kind; a task with no type yet is a task. */
export function refuseRunOfEpic(task: { type: { kind: string } | null }): void {
  if (task.type?.kind === 'EPIC') throw new HttpError(400, EPIC_NOT_RUN)
}
