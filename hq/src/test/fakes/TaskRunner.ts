import { vi } from 'vitest'
import type { Agent } from '@prisma/client'
import type { RunStartedBy } from '@agenthix/core'
import type * as Real from '../../agents/TaskRunner'
import { resetBeforeEachTest, type MissingFrom, type Spy } from './lifecycle'

export {
  HELD_FOR_RECONNECT_REASON,
  SITE_REVOKED_REASON,
  UNPLACEABLE_REASON,
  MANIFEST_BLOCKED_REASON,
} from '../../agents/taskExecutionReasons'

export type RunTaskOutcome = Real.RunTaskOutcome
export type RunTaskResult = Real.RunTaskResult

/** Every task `runTask` was asked to start since the last reset, in order, with the person named for it (when one was). */
export const startedTasks: Array<{ taskId: string; agent: Agent; startedBy: RunStartedBy; personId?: string | null }> = []

/** Starts a task, as far as the caller can tell: records it and answers `started`. */
const runTask: Spy<Real.TaskRunner['runTask']> = vi.fn(async (taskId, agent, startedBy = 'person', personId) => {
  startedTasks.push({ taskId, agent, startedBy, ...(personId !== undefined ? { personId } : {}) })
  return { outcome: 'started' }
})
/** Nothing is waiting in any agent's line. */
const startNext: Spy<Real.TaskRunner['startNext']> = vi.fn(async () => null)
const triggerNext: Spy<Real.TaskRunner['triggerNext']> = vi.fn(async () => {})
const drainHeldTasks: Spy<Real.TaskRunner['drainHeldTasks']> = vi.fn(async () => {})
const failTasksForRevokedSite: Spy<Real.TaskRunner['failTasksForRevokedSite']> = vi.fn(async () => {})

export const taskRunner = { runTask, startNext, triggerNext, drainHeldTasks, failTasksForRevokedSite }

export class TaskRunner {
  runTask = runTask
  startNext = startNext
  triggerNext = triggerNext
  drainHeldTasks = drainHeldTasks
  failTasksForRevokedSite = failTasksForRevokedSite
}

export function reset(): void {
  startedTasks.length = 0
  for (const spy of Object.values(taskRunner)) spy.mockReset()
}

resetBeforeEachTest(reset)

export const _exportsEveryRealName: MissingFrom<typeof Real, typeof import('./TaskRunner')> extends never ? true : never = true
