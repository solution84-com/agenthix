import { type DismissNotification, type MarkNotificationsRead } from 'wasp/server/operations'
import { HttpError } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { ORG_NOTIFICATION_TYPES } from './notificationKinds'
import { acknowledgeBypassedAgents as acknowledge } from './adminNotices'
import { notificationsChanged } from '../server/personEvents'
import type { MarkNotificationsReadArgs } from '@agenthix/core'

type DismissNotificationArgs = { id: string }

/** A persistent notification that is not dismissible is refused: only its subject being addressed clears it. */
export const dismissNotification: DismissNotification<DismissNotificationArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  if (!args.id) throw new HttpError(400, 'id is required')
  const row = await context.entities.Notification.findFirst({
    where: { id: args.id, userId: context.user.id },
    select: { dismissible: true, type: true },
  })
  if (row && !row.dismissible) throw new HttpError(409, 'This notification clears itself once what it is about is fixed')
  // Putting the Bypassed notice away is acknowledging it, for every admin, as Needs attention does.
  if (row?.type === ORG_NOTIFICATION_TYPES.bypassed) {
    await acknowledgeBypassedAgents(undefined, context)
    return
  }
  await context.entities.Notification.updateMany({
    where: { id: args.id, userId: context.user.id },
    data: { status: 'dismissed' },
  })
  notificationsChanged([context.user.id])
}

/** At most this many in one call: the panel sends what came into view, in batches. */
const MAX_IDS = 200

/**
 * Marks the caller's notifications seen: the ones named, which the panel had in
 * view, or every unread one when none are named. Only `unread` moves, so an
 * item that needs the person stays under Needs you until it is handled.
 */
export const markNotificationsRead: MarkNotificationsRead<MarkNotificationsReadArgs | undefined, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const ids = args?.ids ?? null
  if (ids !== null && (!Array.isArray(ids) || !ids.every(id => typeof id === 'string'))) throw new HttpError(400, 'ids must be a list of notification ids')
  if (ids && (ids.length === 0 || ids.length > MAX_IDS)) throw new HttpError(400, `ids must name 1 to ${MAX_IDS} notifications`)
  await context.entities.Notification.updateMany({
    where: { userId: context.user.id, status: 'unread', ...(ids ? { id: { in: ids } } : {}) },
    data: { status: 'read' },
  })
  notificationsChanged([context.user.id])
}

/**
 * An admin acknowledges the agents with approval Bypassed (every screen
 * reviewed spec §3): the notice clears for every admin, and returns when
 * another agent is set to Bypassed.
 */
export const acknowledgeBypassedAgents = async (_args: unknown, context: { user?: { id: string } | null }): Promise<{ acknowledged: string[] }> => {
  await requireRole(context, 'ADMIN', 'Acknowledging the agents with approval Bypassed')
  return acknowledge()
}
