/**
 * When a task run asks for a tool it was not allowed, the person the run is on
 * behalf of is told, with a link to the request on the task (adr-0089): whoever
 * started it — Run, Run again, or a message into the task's session — else the
 * task's person (every-screen-reviewed spec §9). The approval comment on the
 * task is still written; this only makes sure the person answerable for the
 * run hears about it. Anyone who may start runs in the project may approve.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import { notificationsChanged } from '../server/personEvents'

const logger = new Logger('ApprovalNotification')

export const TOOL_APPROVAL_NOTIFICATION_TYPE = 'tool_approval'

// The summary arrives from the site and the title from whoever wrote the task;
// neither is allowed to grow a notification without bound.
const SUMMARY_MAX_LENGTH = 300
const TITLE_MAX_LENGTH = 120

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Best effort: a failure is logged and never undoes the approval request itself. */
/** `personId` names the run's person when the task does not hold it: a run started by a message into its session. */
export async function notifyApprovalWaiting(
  taskId: string,
  agentId: string,
  summary: string | null,
  personId?: string | null,
): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, number: true, onBehalfOfUserId: true, runOnBehalfOfUserId: true, project: { select: { key: true } } },
    })
    if (!task) return
    const runPersonId = personId ?? task.runOnBehalfOfUserId ?? task.onBehalfOfUserId
    // A removed person cannot be told; their tasks are blocked for loss of access instead.
    const person = await prisma.user.findUnique({ where: { id: runPersonId }, select: { id: true } })
    if (!person) return
    const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { handle: true } })

    const taskKey = `${task.project.key}-${task.number}`
    const who = agent ? `@${agent.handle}` : 'An agent'
    const detail = summary ? ` ${clip(summary, SUMMARY_MAX_LENGTH)}` : ''
    await prisma.notification.create({
      data: {
        userId: person.id,
        type: TOOL_APPROVAL_NOTIFICATION_TYPE,
        title: `Approval needed on ${taskKey}`,
        body: `${who} asked to use tools it is not allowed while working on "${clip(task.title, TITLE_MAX_LENGTH)}" on your behalf.${detail}`,
        actionLabel: 'Review the request',
        actionUrl: `/tasks/${taskKey}`,
      },
    })
    notificationsChanged([person.id])
  } catch (err) {
    logger.error(`failed to notify the person behind task ${taskId} of a pending approval`, err)
  }
}
