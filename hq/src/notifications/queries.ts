import { type GetNotifications } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { entitledProjectsFilter } from '../projects/membership'
import { NEEDS_ACTION_TYPES, OPEN_STATUSES, latestPerTask, needsYou, taskKeyOf, type NotificationItem } from './notificationKinds'
import { describeNotification, firstRequest, type TaskOfNotification } from './notificationText'
import { staleRequestIds } from './staleRequests'
import { isOrgAdmin } from '../projects/membership'
import { syncAdminNotices } from './adminNotices'

/** How far back Earlier reaches; what needs the person is always listed in full. */
const EARLIER_LIMIT = 50

const APPROVAL_PREFIX = '__MANIFEST_APPROVAL__:'

/**
 * The caller's notifications that are not dismissed, newest first: every one
 * that needs them, then the latest of the rest. One about a task carries the
 * task — its key, title and agent — and a tool request carries the first thing
 * it wants to run, so each can be shown in two lines. A task is listed once,
 * by its latest request.
 */
export const getNotifications: GetNotifications<void, NotificationItem[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const me = context.user.id
  // What needs an admin about the workplace is worked out when it is read (adminNotices.ts).
  if (await isOrgAdmin(me)) await syncAdminNotices()
  const open = { type: { in: [...NEEDS_ACTION_TYPES] }, status: { in: [...OPEN_STATUSES] } }
  const [needing, earlier] = await Promise.all([
    prisma.notification.findMany({ where: { userId: me, ...open }, orderBy: { createdAt: 'desc' } }),
    prisma.notification.findMany({
      where: { userId: me, status: { not: 'dismissed' }, NOT: open },
      orderBy: { createdAt: 'desc' },
      take: EARLIER_LIMIT,
    }),
  ])
  // One item per task, its latest request: the older ones are handled and no longer listed.
  const { kept: list, superseded } = latestPerTask([...needing, ...earlier])
  const answered = new Set(await staleRequestIds(list.filter(needsYou)))
  const stale = [...superseded.filter(needsYou).map(n => n.id), ...answered]
  if (stale.length > 0) {
    await prisma.notification.updateMany({ where: { id: { in: stale }, userId: me }, data: { status: 'handled' } })
  }
  for (const n of list) if (answered.has(n.id)) n.status = 'handled'
  const tasks = await tasksOf(list.map(n => taskKeyOf(n.actionUrl)), me)
  return list.map((n) => {
    const task = tasks.get(taskKeyOf(n.actionUrl) ?? '') ?? null
    return {
      id: n.id, type: n.type, title: n.title, body: n.body, actionLabel: n.actionLabel, actionUrl: n.actionUrl,
      status: n.status, createdAt: n.createdAt, dismissible: n.dismissible,
      ...describeNotification(n, task),
    }
  })
}

/** The tasks the notifications name, in projects the caller can still see, with their pending tool requests. */
async function tasksOf(keys: (string | null)[], me: string): Promise<Map<string, TaskOfNotification>> {
  const wanted = [...new Set(keys.filter((k): k is string => !!k))].map((key) => {
    const [projectKey, number] = key.split('-')
    return { project: { key: projectKey }, number: Number(number) }
  })
  if (wanted.length === 0) return new Map()
  const rows = await prisma.task.findMany({
    where: { AND: [{ OR: wanted }, { project: entitledProjectsFilter(me) }] },
    select: {
      id: true, title: true, number: true, project: { select: { key: true } },
      assignedAgent: { select: { name: true, avatarUrl: true } },
    },
  })
  const requests = await prisma.taskComment.findMany({
    where: { taskId: { in: rows.map(r => r.id) }, content: { startsWith: APPROVAL_PREFIX } },
    orderBy: { createdAt: 'desc' },
    select: { taskId: true, content: true },
  })
  const latestRequest = new Map<string, string>()
  for (const r of requests) if (!latestRequest.has(r.taskId)) latestRequest.set(r.taskId, r.content.slice(APPROVAL_PREFIX.length))

  return new Map(rows.map((t): [string, TaskOfNotification] => {
    const key = `${t.project.key}-${t.number}`
    return [key, { key, title: t.title, agent: t.assignedAgent, request: firstRequest(latestRequest.get(t.id)) }]
  }))
}
