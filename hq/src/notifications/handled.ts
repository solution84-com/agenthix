/**
 * A task's waiting notifications clear themselves (every screen reviewed spec
 * §6): when its run moves on, or anyone answers its tool request, the requests
 * and "needs you" notices it raised — for whoever they went to — are handled,
 * and move from Needs you to Earlier. Called where a task's new run is
 * dispatched and where a tool request is decided.
 */
import { prisma } from 'wasp/server'
import { Logger } from '../server/utils/logger'
import { notificationsChanged } from '../server/personEvents'
import { CONVERSATION_NOTIFICATION_TYPES, OPEN_STATUSES, TASK_NOTIFICATION_TYPES, taskActionUrl } from './notificationKinds'

const logger = new Logger('HandledNotifications')

/** Best effort: a failure is logged and never undoes the run or the answer. */
export async function markTaskNotificationsHandled(taskId: string): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { number: true, project: { select: { key: true } } } })
    if (!task) return
    const { count } = await prisma.notification.updateMany({
      where: {
        type: { in: [...TASK_NOTIFICATION_TYPES] },
        actionUrl: taskActionUrl(`${task.project.key}-${task.number}`),
        status: { in: [...OPEN_STATUSES] },
      },
      data: { status: 'handled' },
    })
    if (count > 0) notificationsChanged()
  } catch (err) {
    logger.error(`could not clear the waiting notifications of task ${taskId}`, err)
  }
}

/** A conversation's approval request was answered or stopped: its notification is handled, for whoever it went to. */
export async function markOperationNotificationsHandled(operationId: string): Promise<void> {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { type: CONVERSATION_NOTIFICATION_TYPES.approval, operationId, status: { in: [...OPEN_STATUSES] } },
      data: { status: 'handled' },
    })
    if (count > 0) notificationsChanged()
  } catch (err) {
    logger.error(`could not clear the approval notifications of operation ${operationId}`, err)
  }
}
