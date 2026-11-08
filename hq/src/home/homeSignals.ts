/**
 * Home's line of signals (every screen reviewed spec §8): how many notifications
 * need the caller, how many of their runs are going now, and how much of their
 * automation comes up before their day ends. Each counts only what is the
 * caller's own or acts on their behalf, in projects they can still see.
 */
import type { GetHomeSignals } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { entitledProjectsFilter } from '../projects/membership'
import type { HomeSignals } from '../shared/homeTypes'
import type { HomeSignalsArgs } from '@agenthix/core'
import { NEEDS_ACTION_TYPES, OPEN_STATUSES, latestPerTask } from '../notifications/notificationKinds'
import { countMyRunsGoing } from '../runs/myRuns'

/** "Today" never reaches further than this, whatever the browser says its day's end is. */
const MAX_DAY_MS = 24 * 60 * 60 * 1000

type Args = HomeSignalsArgs

function endOfDay(until: unknown, now: number): Date {
  const at = typeof until === 'string' ? Date.parse(until) : NaN
  if (Number.isNaN(at)) throw new HttpError(400, 'until must be a time')
  return new Date(Math.min(at, now + MAX_DAY_MS))
}

export const getHomeSignals: GetHomeSignals<Args, HomeSignals> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const me = context.user.id
  const now = Date.now()
  const until = endOfDay(args?.until, now)
  const due = { gte: new Date(now), lte: until }
  const project = entitledProjectsFilter(me)

  // The same numbers as the bell (Needs you) and the Runs button (the person's runs going now).
  const [notificationsNeedingYou, agentsAtWork, routineFirings, scheduledTasks] = await Promise.all([
    countNeedingYou(me),
    countMyRunsGoing(me),
    prisma.routine.count({ where: { onBehalfOfUserId: me, enabled: true, nextDueAt: due, project } }),
    prisma.task.count({ where: { onBehalfOfUserId: me, archived: false, scheduleNextDueAt: due, project } }),
  ])

  return { notificationsNeedingYou, agentsAtWork, comingUpToday: routineFirings + scheduledTasks }
}

/** The total under Needs you: one per task, as the panel lists them. */
async function countNeedingYou(me: string): Promise<number> {
  const open = await prisma.notification.findMany({
    where: { userId: me, type: { in: [...NEEDS_ACTION_TYPES] }, status: { in: [...OPEN_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    select: { type: true, actionUrl: true },
  })
  return latestPerTask(open).kept.length
}
