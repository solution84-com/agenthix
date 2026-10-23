/**
 * Stop all for one place (every screen reviewed spec §3, §9): a project, or a
 * person's own space — their personal project and their conversations outside
 * any project.
 *
 * Every queued task there is withdrawn and every running one stopped, as each
 * task's own Stop does (stopTask.ts): the run state goes to RUN_NONE before the
 * cancels are sent, so a cancelled run's status frame finds it settled and
 * starts nothing after it. The caller's own conversations there are stopped
 * too. Another person's conversation is theirs alone to stop, as it is for a
 * single run (cancelAgentRun, stopTaskSession), so it is left running.
 *
 * Allowed to the project's admins; a person is the admin of their own personal
 * project, so in their own space it is theirs.
 */
import type { StopPlaceRuns } from 'wasp/server/operations'
import type { Prisma } from '@prisma/client'
import { HttpError, prisma } from 'wasp/server'
import { requireProjectAdmin } from './membership'
import { requireProjectVisible } from './resourceEntitlement'
import { stopRunsOfSessions, RunsNotConfirmedStopped } from './projectRunStop'
import { personName } from '../sessions/transcriptAuthors'
import { notifyBoardsOfTasks } from './boardNotify'

const PENDING_RUN_STATES = ['RUN_QUEUED', 'RUN_THROTTLED', 'RUN_ACTIVE'] as const

/** A person waits on this, so it is shorter than a delete's wait. */
const STOP_ALL_TIMEOUT_MS = 10_000

/** The sessions whose runs a place's Stop all ends, for this caller. */
function placeSessions(projectId: string, space: boolean, userId: string): Prisma.AgentSessionWhereInput {
  const ownChat = { sessionType: 'chat', userId, taskId: null }
  if (space) {
    return {
      OR: [
        { task: { projectId } },
        // A task run whose task was deleted still works in its person's own storage.
        { sessionType: { not: 'chat' }, primaryOwnerType: 'user', primaryOwnerId: userId },
        { ...ownChat, OR: [{ primaryOwnerType: null }, { primaryOwnerType: 'user', primaryOwnerId: userId }] },
      ],
    }
  }
  return {
    OR: [
      { task: { projectId } },
      { sessionType: { not: 'chat' }, primaryOwnerType: 'project', primaryOwnerId: projectId },
      { ...ownChat, primaryOwnerType: 'project', primaryOwnerId: projectId },
    ],
  }
}

export const stopPlaceRuns: StopPlaceRuns<{ projectId: string }, { withdrawn: number; cancelled: number }> = async (
  args,
  context,
) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const userId = context.user.id
  await requireProjectVisible(args?.projectId, userId)
  await requireProjectAdmin(args.projectId, userId, 'Stopping every run in this project')

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: args.projectId },
    select: { personalOwnerId: true, personalSpace: true, executionSite: { select: { siteId: true } } },
  })

  const tasks = await prisma.task.findMany({
    where: { projectId: args.projectId, runState: { in: [...PENDING_RUN_STATES] } },
    select: { id: true, runState: true, runStateReason: true, runId: true },
  })
  if (tasks.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: tasks.map((t) => t.id) }, runState: { in: [...PENDING_RUN_STATES] } },
      data: { runState: 'RUN_NONE', runStateReason: null },
    })
  }

  let cancelled: number
  try {
    cancelled = await stopRunsOfSessions(
      placeSessions(args.projectId, project.personalOwnerId !== null && project.personalSpace, userId),
      project.executionSite?.siteId ?? null,
      { timeoutMs: STOP_ALL_TIMEOUT_MS, by: await personName(userId) },
    )
  } catch (err) {
    await restoreRunning(tasks)
    if (err instanceof RunsNotConfirmedStopped) {
      throw new HttpError(err.status, `Not every run here could be confirmed stopped: ${err.detail}. Try again.`)
    }
    throw err
  } finally {
    await notifyBoardsOfTasks(tasks.map((t) => t.id))
  }
  return { withdrawn: tasks.length, cancelled }
}

/**
 * A running task whose run may not have stopped is put back as it was, so it is
 * never shown as stopped while it still runs; its run's end settles it as
 * usual. A queued task stays withdrawn: it had not started.
 */
async function restoreRunning(tasks: Array<{ id: string; runState: string; runStateReason: string | null; runId: string | null }>) {
  for (const task of tasks.filter((t) => t.runState === 'RUN_ACTIVE')) {
    await prisma.task.updateMany({
      where: { id: task.id, runState: 'RUN_NONE' },
      data: { runState: 'RUN_ACTIVE', runStateReason: task.runStateReason, runId: task.runId },
    })
  }
}
