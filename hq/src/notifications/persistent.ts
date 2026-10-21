/**
 * Persistent notifications (every screen reviewed spec §6): a kind any feature
 * may raise. One stays under Needs you until what it is about is addressed —
 * the feature clears it, and it moves to Earlier as `handled` — or, where its
 * kind allows, until a person dismisses it.
 *
 * A notification is about a subject: its `type` and `subjectKey` together (for
 * example a site's id). A person has at most one per subject: raising one for
 * a subject that already has an open notification updates it, and a problem
 * that returns after it was addressed reopens the handled one, back at the top
 * of Needs you, rather than making a second. A person
 * who dismissed one is not given it again for the same subject, so a feature
 * whose dismissible notice can come back for a new reason names that reason
 * in its subject key. Its type goes in `PERSISTENT_TYPES` (`notificationKinds.ts`),
 * which is what puts it under Needs you.
 *
 * hq is one process, so raising and clearing are serialised here per subject:
 * two raises at once cannot both find nothing and both create one.
 */
import { prisma } from 'wasp/server'
import { OPEN_STATUSES } from './notificationKinds'
import { notificationsChanged } from '../server/personEvents'

export type PersistentNotice = {
  type: string
  subjectKey: string
  title: string
  body: string
  actionLabel?: string | null
  actionUrl?: string | null
  /** Whether a person may dismiss it. Default false: only its subject being addressed clears it. */
  dismissible?: boolean
}

const OPEN = { in: [...OPEN_STATUSES] }

const chains = new Map<string, Promise<unknown>>()

function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).then(work, work)
  chains.set(key, next)
  void next.finally(() => { if (chains.get(key) === next) chains.delete(key) }).catch(() => {})
  return next
}

async function raiseFor(userId: string, notice: PersistentNotice): Promise<void> {
  const latest = await prisma.notification.findFirst({
    where: { userId, type: notice.type, subjectKey: notice.subjectKey },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, title: true, body: true, actionLabel: true, actionUrl: true, dismissible: true },
  })
  const content = {
    title: notice.title,
    body: notice.body,
    actionLabel: notice.actionLabel ?? null,
    actionUrl: notice.actionUrl ?? null,
    dismissible: notice.dismissible ?? false,
  }
  if (latest && latest.status === 'dismissed' && latest.dismissible) return
  if (latest && (OPEN_STATUSES as readonly string[]).includes(latest.status)) {
    const same = (Object.keys(content) as (keyof typeof content)[]).every(k => latest[k] === content[k])
    if (same) return
    // A new title is news: it shows as not yet seen again. A changed line 2 alone is not.
    const renewed = latest.title !== content.title ? { status: 'unread' } : {}
    await prisma.notification.update({ where: { id: latest.id }, data: { ...content, ...renewed } })
    notificationsChanged([userId])
    return
  }
  if (latest) {
    await prisma.notification.update({ where: { id: latest.id }, data: { ...content, status: 'unread', createdAt: new Date() } })
    notificationsChanged([userId])
    return
  }
  await prisma.notification.create({
    data: { userId, type: notice.type, subjectKey: notice.subjectKey, ...content },
  })
  notificationsChanged([userId])
}

/** Raises the notice for each person, or brings their open one up to date. */
export function raisePersistentNotification(userIds: string[], notice: PersistentNotice): Promise<void> {
  return serialised(`${notice.type}\u0000${notice.subjectKey}`, async () => {
    for (const userId of new Set(userIds)) await raiseFor(userId, notice)
  })
}

/**
 * Its subject is addressed: every open notification of `type` about it, for
 * whoever it went to, is handled and moves to Earlier. `subjectKey` may be a
 * prefix (`{ startsWith }`) to clear every subject under it. Resolves how many
 * were cleared.
 */
export function clearPersistentNotification(
  type: string,
  subjectKey: string | { startsWith: string },
  opts: { exceptUserIds?: string[] } = {},
): Promise<number> {
  const key = typeof subjectKey === 'string' ? subjectKey : `${subjectKey.startsWith}*`
  return serialised(`${type}\u0000${key}`, async () => {
    const { count } = await prisma.notification.updateMany({
      where: {
        type,
        subjectKey,
        status: OPEN,
        ...(opts.exceptUserIds ? { userId: { notIn: opts.exceptUserIds } } : {}),
      },
      data: { status: 'handled' },
    })
    if (count > 0) notificationsChanged()
    return count
  })
}

/**
 * Makes the open notifications of one type exactly `notices`, each for every
 * one of `userIds`: raises or updates those, and clears every other open one
 * of the type — a subject no longer listed, or a person no longer among
 * `userIds`. What a feature calls when it works out the whole of a type's
 * state at once, so a missed event never leaves one stuck. The subjects in
 * `keep` are ones the feature cannot decide yet: their open notifications are
 * left as they are, and none is raised for them.
 */
export async function syncPersistentNotifications(
  type: string,
  notices: PersistentNotice[],
  userIds: string[],
  opts: { keep?: string[] } = {},
): Promise<void> {
  const wanted = new Set([...notices.map(n => n.subjectKey), ...(opts.keep ?? [])])
  const open = await prisma.notification.findMany({
    where: { type, status: OPEN, subjectKey: { not: null } },
    select: { subjectKey: true },
    distinct: ['subjectKey'],
  })
  for (const { subjectKey } of open) {
    if (subjectKey && !wanted.has(subjectKey)) await clearPersistentNotification(type, subjectKey)
  }
  for (const notice of notices) {
    await clearPersistentNotification(type, notice.subjectKey, { exceptUserIds: userIds })
    await raisePersistentNotification(userIds, { ...notice, type })
  }
}
