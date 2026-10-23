/**
 * hq's side of a scheduled change (host-management spec §14): a notice from the host service that holds it —
 * through hq's control socket for one on hq's machine, from a site over its channel for one on that site's
 * machine — is kept, newest first, and acted on: the members whose work it affects are told, and runs on what it
 * affects are held around it.
 *
 * A notice from a site speaks only for that site: hq takes the site from the connection and never lets a site's
 * notice reach hq itself or another site.
 */
import { prisma } from 'wasp/server'
import type { Prisma, ScheduledChange } from '@prisma/client'
import { SCHEDULED_CHANGE_PAUSE_LEAD_MS, parseRunStartedBy, parseScheduledChangeNotice, type ScheduledChangeKind, type ScheduledChangeNotice } from '@agenthix/core'
import { clearPersistentNotification, raisePersistentNotification } from '../../notifications/persistent'
import { Logger } from '../../server/utils/logger'
import { noticeText, type ChangeFacts } from './noticeWords'
import { atOnce, lifecycleNoticeText, speaksOn } from './lifecycleWords'
import { endHold, holdEnds, holding, pauseRuns, waitingFor } from './runHold'

const logger = new Logger('ScheduledChanges')

export const SCHEDULED_CHANGE_NOTIFICATION = 'scheduled_change'

/** Where a notice came from: hq's own machine, or the site whose connection carried it. */
export type NoticeSource = { from: 'hqMachine' } | { from: 'site'; siteId: string }

const chains = new Map<string, Promise<unknown>>()

function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).then(work, work)
  chains.set(key, next)
  void next.finally(() => { if (chains.get(key) === next) chains.delete(key) }).catch(() => {})
  return next
}

/** The site a notice is about: the one that sent it, or for a change of hq's machine's site, hq's own. */
async function siteOf(notice: ScheduledChangeNotice, source: NoticeSource): Promise<string | null> {
  if (source.from === 'site') return source.siteId
  if (notice.change.target === 'hq') return null
  const own = await prisma.executionSite.findFirst({ where: { isDefault: true }, select: { siteId: true } })
  return own?.siteId ?? null
}

/** Keeps the notice if it is newer than what hq has; the row, or null when it was older (or not about anything). */
async function keep(notice: ScheduledChangeNotice, source: NoticeSource): Promise<ScheduledChange | null> {
  const key = source.from === 'site' ? `site:${source.siteId}` : 'hq'
  // A site's notice is about that site, whatever it says; only hq's machine speaks for hq.
  const siteId = await siteOf(notice, source)
  if (source.from === 'hqMachine' && notice.change.target === 'site' && !siteId) return null
  const c = notice.change
  const data = {
    siteId, kind: c.kind, at: new Date(c.at), state: c.state, lastUpdate: notice.update, detail: c.detail,
    expectedMinutes: c.expectedMinutes, reason: notice.reason, machineName: c.machine.name, sentAt: new Date(notice.sentAt),
  }
  return serialised(`${key}\u0000${c.id}`, async () => {
    const found = await prisma.scheduledChange.findUnique({ where: { source_changeId: { source: key, changeId: c.id } } })
    if (!found) return prisma.scheduledChange.create({ data: { source: key, changeId: c.id, ...data } })
    if (found.sentAt.getTime() >= data.sentAt.getTime()) return null
    return prisma.scheduledChange.update({ where: { id: found.id }, data })
  })
}

export function projectsOnSite(siteId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { executionSite: { siteId } },
      { personalSpace: true, personalOwner: { is: { storagePlacement: { is: { site: { siteId } } } } } },
    ],
  }
}

const ACTIVE = { deactivatedAt: null, erasedAt: null }

/** Each affected person with their projects where the change is (none listed for a change to hq itself). */
export async function affectedMembers(siteId: string | null): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (!siteId) {
    for (const u of await prisma.user.findMany({ where: ACTIVE, select: { id: true } })) out.set(u.id, [])
    return out
  }
  const rows = await prisma.projectMember.findMany({
    where: { project: projectsOnSite(siteId), user: ACTIVE },
    select: { userId: true, project: { select: { name: true, personalOwnerId: true } } },
    orderBy: { project: { name: 'asc' } },
  })
  for (const r of rows) {
    const list = out.get(r.userId) ?? []
    list.push(r.project.personalOwnerId ? 'Your own work' : r.project.name)
    out.set(r.userId, list)
  }
  return out
}

async function tell(row: ScheduledChange): Promise<void> {
  const prefix = `${row.id}:`
  const siteName = row.siteId ? (await prisma.executionSite.findUnique({ where: { siteId: row.siteId }, select: { label: true } }))?.label ?? null : null
  const facts: ChangeFacts = { kind: row.kind as ScheduledChangeKind, siteName: row.siteId ? siteName ?? 'its site' : null, at: row.at, expectedMinutes: row.expectedMinutes, detail: row.detail }
  const update = row.lastUpdate as ScheduledChangeNotice['update']
  if ((update === 'pausing' || update === 'started') && !speaksOn(facts, update)) return
  // Each new time or outcome is its own subject, so a person who put the last one away still hears of this one.
  await clearPersistentNotification(SCHEDULED_CHANGE_NOTIFICATION, { startsWith: prefix })
  if (update === 'completed') return
  const now = atOnce(row.at, row.sentAt)
  const subjectKey = `${prefix}${update === 'scheduled' || update === 'changed' ? row.at.toISOString() : update}`
  const members = await affectedMembers(row.siteId)
  const zones = new Map((await prisma.userSettings.findMany({
    where: { userId: { in: [...members.keys()] } }, select: { userId: true, timezone: true },
  })).map(s => [s.userId, s.timezone ?? 'UTC']))
  for (const [userId, projects] of members) {
    const zone = zones.get(userId) ?? 'UTC'
    const special = lifecycleNoticeText(update, facts, projects, zone, now)
    const text = special === undefined ? noticeText(update, facts, projects, zone) : special
    if (!text) continue
    await raisePersistentNotification([userId], { type: SCHEDULED_CHANGE_NOTIFICATION, subjectKey, ...text, dismissible: true })
  }
}

/** Starts again every task that waited for the change, through the ordinary claim, as the reconnect drain does. */
async function resumeWaiting(row: ScheduledChange): Promise<void> {
  // Imported when needed: TaskRunner reaches the channel's event handler, which reaches this module.
  const { taskRunner } = await import('../../agents/TaskRunner')
  const waiting = await prisma.task.findMany({ where: waitingFor(row), include: { assignedAgent: true } })
  for (const task of waiting) {
    if (!task.assignedAgent) continue
    void taskRunner.runTask(task.id, task.assignedAgent, parseRunStartedBy(task.runStartedBy) ?? 'pulse', task.runOnBehalfOfUserId)
  }
}

async function stopRun(siteId: string, runId: string, by: string, paused: boolean): Promise<void> {
  const { cancelRun } = await import('../../sessions/siteRuntimeStore')
  await cancelRun(siteId, runId, paused ? 'paused' : undefined, by)
}

async function siteOfTask(taskId: string): Promise<string> {
  const { resolveSiteIdForTask } = await import('../../agents/dispatchSiteResolution')
  return resolveSiteIdForTask(taskId)
}

/** Holds or releases runs as the change moves on. */
export async function actOn(row: ScheduledChange, now = new Date()): Promise<void> {
  switch (row.lastUpdate) {
    case 'pausing':
    case 'started':
      await pauseRuns(row, stopRun, siteOfTask)
      return
    case 'changed':
      if (row.pausedAt && row.at.getTime() - now.getTime() > SCHEDULED_CHANGE_PAUSE_LEAD_MS && await endHold(row, { reopen: true })) {
        await resumeWaiting(row)
      }
      return
    case 'completed':
    case 'failed':
    case 'cancelled':
    case 'missed':
      if (await endHold(row)) await resumeWaiting(row)
      return
  }
}

/**
 * hq's own clock, every minute: a change whose lead has come holds runs even before its notice says so, and one
 * long past its time and length lets them go even if its end never reached hq.
 */
export async function sweepScheduledChanges(now = new Date()): Promise<void> {
  const open = await prisma.scheduledChange.findMany({ where: { resumedAt: null, state: { notIn: ['done', 'rolledBack', 'cancelled', 'missed'] } } })
  for (const row of open) {
    if (!row.pausedAt && holding(row, now)) await pauseRuns(row, stopRun, siteOfTask)
    else if (now.getTime() > holdEnds(row) && await endHold(row)) await resumeWaiting(row)
  }
}

let timer: ReturnType<typeof setInterval> | null = null

export function startScheduledChangeSweep(intervalMs = 60_000): void {
  if (timer) return
  timer = setInterval(() => { sweepScheduledChanges().catch(err => logger.error('scheduled-change sweep failed', err)) }, intervalMs)
  timer.unref?.()
}

/** The email the day before, which Cloud sends when hq is connected to it (pre-release spec C3). */
async function emailAbout(row: ScheduledChange): Promise<void> {
  // Imported when needed: the Cloud module reaches this one for the members a change affects.
  const { emailAboutScheduledChange } = await import('../../cloud')
  await emailAboutScheduledChange(row)
}

/** One notice, from wherever it came. False when it was not one, or was older than what hq has. */
export async function recordScheduledChangeNotice(data: unknown, source: NoticeSource): Promise<boolean> {
  const notice = parseScheduledChangeNotice(data)
  if (!notice) return false
  const row = await keep(notice, source)
  if (!row) return false
  await tell(row).catch(err => logger.error('could not tell members of a scheduled change', err))
  await actOn(row).catch(err => logger.error('could not hold or release runs for a scheduled change', err))
  await emailAbout(row).catch(err => logger.error('could not ask Agenthix Cloud to email members about a scheduled change', err))
  return true
}

/** The channel's `site.scheduledChange` event. */
export async function handleScheduledChangeEvent(siteId: string, data: unknown): Promise<void> {
  if (!(await recordScheduledChangeNotice(data, { from: 'site', siteId }))) {
    logger.info(`a scheduled-change notice from site ${siteId} was not newer than hq's, or not one — dropped`)
  }
}
