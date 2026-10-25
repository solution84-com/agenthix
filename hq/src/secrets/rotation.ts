/**
 * Rotation is planned (spec part 3, S6): a secret may carry a rotate-by date. A week before it, the place's
 * administrators are told; from the day it shows *overdue*, and the notice says so. Each is a persistent
 * notification about the secret (`notifications/persistent.ts`), cleared when the secret is replaced, its date moves
 * or it is deleted. One sweep works out the whole state each hour, so a missed change never leaves a notice stuck.
 */
import { prisma } from 'wasp/server'
import { clearPersistentNotification, raisePersistentNotification } from '../notifications/persistent'
import { SECRET_ROTATION_NOTIFICATION } from '../notifications/notificationKinds'
import { Logger } from '../server/utils/logger'
import { placeAdministrators } from './access'
import { secretsDb, type DueRotation } from './db'
import type { RotationState } from './views'

const logger = new Logger('SecretRotation')

export { SECRET_ROTATION_NOTIFICATION }
export const ROTATION_NOTICE_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const SWEEP_MS = 60 * 60 * 1000

export type { RotationState }

/** Overdue from the start of the rotate-by day; due soon in the week before it. */
export function rotationState(rotateBy: Date | null, now: Date): RotationState {
  if (!rotateBy) return 'none'
  const day = startOfDay(rotateBy).getTime()
  if (now.getTime() >= day) return 'overdue'
  return now.getTime() >= day - ROTATION_NOTICE_DAYS * DAY_MS ? 'due_soon' : 'none'
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

const dateWords = (d: Date) => d.toISOString().slice(0, 10)

/** Where the place's secrets are listed. */
async function secretsPageUrl(s: DueRotation): Promise<string> {
  if (s.place.type === 'user') return '/space/secrets'
  const project = await prisma.project.findUnique({ where: { id: s.place.id }, select: { key: true, personalSpace: true } })
  if (!project) return '/'
  return project.personalSpace ? '/space/secrets' : `/projects/${project.key}/secrets`
}

export function rotationNotice(s: Pick<DueRotation, 'name' | 'rotateBy'>, state: Exclude<RotationState, 'none'>, url: string) {
  return {
    type: SECRET_ROTATION_NOTIFICATION,
    title: state === 'overdue'
      ? `${s.name} is overdue to be replaced`
      : `${s.name} is due to be replaced by ${dateWords(s.rotateBy)}`,
    body: 'Get a new value from where it is issued, then replace the secret here. Runs use the new value from the next one.',
    actionLabel: 'Open secrets',
    actionUrl: url,
    dismissible: false,
  }
}

/** Raises or brings up to date each due secret's notice for its place's administrators, and clears every other. */
export async function sweepRotationNotices(now: Date = new Date()): Promise<void> {
  const due = await secretsDb().dueRotations(new Date(now.getTime() + ROTATION_NOTICE_DAYS * DAY_MS + DAY_MS))
  const live = new Set<string>()
  for (const s of due) {
    const state = rotationState(s.rotateBy, now)
    if (state === 'none') continue
    live.add(s.id)
    const admins = await placeAdministrators(s.place)
    await clearPersistentNotification(SECRET_ROTATION_NOTIFICATION, s.id, { exceptUserIds: admins })
    await raisePersistentNotification(admins, { ...rotationNotice(s, state, await secretsPageUrl(s)), subjectKey: s.id })
  }
  const open = await prisma.notification.findMany({
    where: { type: SECRET_ROTATION_NOTIFICATION, status: { in: ['unread', 'read'] }, subjectKey: { not: null } },
    select: { subjectKey: true },
    distinct: ['subjectKey'],
  })
  for (const { subjectKey } of open) {
    if (subjectKey && !live.has(subjectKey)) await clearPersistentNotification(SECRET_ROTATION_NOTIFICATION, subjectKey)
  }
}

/** The secret was replaced, its date moved, or it was deleted: its notice is handled. The next sweep raises it again if still due. */
export async function clearRotationNotice(secretId: string): Promise<void> {
  await clearPersistentNotification(SECRET_ROTATION_NOTIFICATION, secretId)
}

let timer: ReturnType<typeof setInterval> | null = null

/** Started once with the server: a sweep now and every hour. */
export function startRotationNotices(): void {
  if (timer) return
  const sweep = () => sweepRotationNotices().catch(err => logger.warn('rotation notices not swept:', err))
  void sweep()
  timer = setInterval(() => void sweep(), SWEEP_MS)
  timer.unref?.()
}
