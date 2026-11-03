/**
 * A clash goes back to the branch's agent at once, on behalf of the person who pressed *Merge* (live preview spec,
 * *Merge into main*; *Defaults for review* 11): for a conversation, a message from them in it; for a task, a comment
 * from them on it and the task run again. And when a branch closes after its merge, its work says so.
 */
import { randomUUID } from 'node:crypto'
import { prisma } from 'wasp/server'
import type { MergeClash } from '@agenthix/core'
import { admitMessage } from '../conversations/coordinator/admission'
import { appendMessage } from '../conversations/store/messages'
import { conversationEvents } from '../conversations/coordinator/events'
import { createTaskComment } from '../projects/taskStateService'
import { askedToStart } from '../projects/taskQueueing'
import { LOST_ACCESS_REASON, personQueuer } from '../projects/taskOnBehalfOf'
import { notifyBoardsOfTasks } from '../projects/boardNotify'
import { replaceTaskRequests } from '../agents/manifestRequests'
import { Logger } from '../server/utils/logger'
import type { WorkOf } from './branchRows'

const logger = new Logger('BranchClash')

/** The most clashing files named; the rest are counted. */
const NAMED_MAX = 20

export function clashAskText(branch: string, main: string, clashes: readonly MergeClash[]): string {
  const named = clashes.slice(0, NAMED_MAX).map(c => `- ${c.path}${c.version ? ` (changed on ${main} in v${c.version.number}: ${c.version.subject})` : ''}`)
  if (clashes.length > NAMED_MAX) named.push(`- and ${clashes.length - NAMED_MAX} more`)
  return [
    `I tried to merge the branch ${branch} into ${main}, and nothing was merged: these files changed on ${main} too.`,
    ...named,
    `Please bring ${branch} up to date with ${main}: call update_from_main, resolve the clashes it names, check the ` +
      'work still works, and call commit to finish the merge. Then tell me here that it is ready to merge. Do not merge it yourself, ' +
      'and do not start the app or open a live preview for this: I only need the branch ready to merge.',
  ].join('\n')
}

/** True when the agent was asked. */
export async function askAgentAboutClash(work: WorkOf, personId: string, text: string): Promise<boolean> {
  try {
    if ('conversationId' in work) {
      await admitMessage({ conversationId: work.conversationId, text, clientMessageId: randomUUID() }, personId)
      return true
    }
    await createTaskComment({ taskId: work.taskId, authorType: 'USER', userId: personId, content: text })
    return await runTaskAgain(work.taskId, personId)
  } catch (err) {
    logger.warn(`the clash was not sent to the branch's agent: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/**
 * The task runs again as the person's. A run already queued or going reads the comment at its next start. A task
 * waiting for an approval runs now too, as a person's Run does: the comment is newer than the request, which it
 * replaces. Only a task held because its person lost access to the project is left, as Run leaves it.
 */
async function runTaskAgain(taskId: string, personId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignedAgent: true } })
  if (!task?.assignedAgent) return false
  if (task.runState === 'RUN_ACTIVE' || task.runState === 'RUN_QUEUED' || task.runState === 'RUN_THROTTLED') return true
  if (task.runState === 'RUN_BLOCKED' && task.runStateReason === LOST_ACCESS_REASON) return false
  const { count } = await prisma.task.updateMany({
    where: {
      id: taskId,
      OR: [
        { runState: { in: ['RUN_NONE', 'RUN_FAILED'] } },
        { runState: 'RUN_BLOCKED', runStateReason: null },
        { runState: 'RUN_BLOCKED', NOT: { runStateReason: LOST_ACCESS_REASON } },
      ],
    },
    data: askedToStart('person', personQueuer(personId), 'queued to bring its branch up to date with main'),
  })
  if (count === 0) return false
  await notifyBoardsOfTasks([taskId])
  if (task.runState === 'RUN_BLOCKED') await replaceTaskRequests(taskId)
  const { taskRunner } = await import('../agents/TaskRunner')
  void taskRunner.runTask(taskId, task.assignedAgent, 'person', personId)
  return true
}

/** The branch's conversation or task says it was merged and closed. */
export async function sayMerged(work: WorkOf, personId: string, branch: string, main: string, version: number): Promise<void> {
  const text = `The branch ${branch} was merged into ${main} as v${version} and closed.`
  try {
    if ('conversationId' in work) {
      const { message } = await appendMessage({ conversationId: work.conversationId, role: 'PLATFORM', kind: 'NOTICE', authorId: personId, body: { text } })
      conversationEvents.message(work.conversationId, message)
    } else {
      await createTaskComment({ taskId: work.taskId, authorType: 'USER', userId: personId, content: text })
    }
  } catch (err) {
    logger.warn(`the branch's work was not told of its merge: ${err instanceof Error ? err.message : String(err)}`)
  }
}
