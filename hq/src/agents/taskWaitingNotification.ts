/**
 * When a task's run state becomes "Needs you" (RUN_BLOCKED), the person it runs
 * on behalf of (adr-0089) is told, with an action that opens the task (every
 * screen reviewed spec §6, §9).
 *
 * Two blocks are told elsewhere or not at all: a run that asked for a tool is
 * told by its approval notification (approvalNotification.ts), and a task
 * blocked because its person lost access is not theirs to act on any more. It
 * is called where a run's end blocks a task, which happens once per block; an
 * unread notice of the same task also stops a second, so a duplicate frame
 * cannot tell the person twice.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import { LOST_ACCESS_REASON } from '../projects/taskOnBehalfOf'
import { notificationsChanged } from '../server/personEvents'

const logger = new Logger('TaskWaitingNotification')

export const TASK_WAITING_NOTIFICATION_TYPE = 'task_waiting'

const TITLE_MAX_LENGTH = 120
const REASON_MAX_LENGTH = 300

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** Best effort: a failure is logged and never undoes the block. */
export async function notifyTaskWaiting(taskId: string, reason: string | null): Promise<void> {
  if (reason === LOST_ACCESS_REASON) return
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { title: true, number: true, onBehalfOfUserId: true, runOnBehalfOfUserId: true, project: { select: { key: true } } },
    })
    if (!task) return
    // The run's person when someone started it, else the task's (adr-0095).
    const person = await prisma.user.findUnique({ where: { id: task.runOnBehalfOfUserId ?? task.onBehalfOfUserId }, select: { id: true } })
    if (!person) return

    const taskKey = `${task.project.key}-${task.number}`
    const actionUrl = `/tasks/${taskKey}`
    const standing = await prisma.notification.findFirst({
      where: { userId: person.id, type: TASK_WAITING_NOTIFICATION_TYPE, actionUrl, status: 'unread' },
      select: { id: true },
    })
    if (standing) return

    const detail = reason ? ` ${clip(reason, REASON_MAX_LENGTH)}` : ''
    await prisma.notification.create({
      data: {
        userId: person.id,
        type: TASK_WAITING_NOTIFICATION_TYPE,
        title: `${taskKey} needs you`,
        body: `"${clip(task.title, TITLE_MAX_LENGTH)}" is waiting for you.${detail}`,
        actionLabel: 'Open the task',
        actionUrl,
      },
    })
    notificationsChanged([person.id])
  } catch (err) {
    logger.error(`failed to tell the person behind task ${taskId} that it needs them`, err)
  }
}
