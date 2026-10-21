/**
 * The record of what fleet admins did (host-management spec §7: "The record of what fleet admins did is kept in hq"),
 * written by the Fleet Console over the console link (`activity.record`) and by hq itself for what hq's machine and the
 * role changes did. Read by fleet admins only; its screen is the Fleet Console's.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetFleetActivity } from 'wasp/server/operations'
import { peopleByIds } from '../server/identity/people'
import { announce } from './announce'
import { activityNotice } from './activityWords'
import { FLEET_ACTIVITY_NOTIFICATION } from './fleetNoticeKinds'

export { FLEET_ACTIVITY_NOTIFICATION }
const PAGE = 200

export type ActivityInput = { byUserId: string | null; action: string; subject: string; at: Date; announce: boolean }

/** The record is kept for a year (the Fleet Console's *Activity*); older entries go as new ones are written. */
export const ACTIVITY_KEPT_MS = 365 * 24 * 60 * 60_000

export async function recordActivity(input: ActivityInput): Promise<void> {
  await prisma.fleetActivity.deleteMany({ where: { at: { lt: new Date(Date.now() - ACTIVITY_KEPT_MS) } } })
  await prisma.fleetActivity.create({
    data: { byUserId: input.byUserId, action: input.action, subject: input.subject, at: input.at, announced: input.announce },
  })
  if (!input.announce) return
  const who = input.byUserId ? (await peopleByIds([input.byUserId])).get(input.byUserId)!.name : 'A machine admin'
  await announce({ type: FLEET_ACTIVITY_NOTIFICATION, ...activityNotice(who, input.action, input.subject) })
}

/** What the Fleet Console sends: the person it names must have an account in hq; null is the machine itself. */
export async function recordConsoleActivity(input: ActivityInput): Promise<boolean> {
  if (input.byUserId !== null && !(await prisma.user.count({ where: { id: input.byUserId } }))) return false
  await recordActivity(input)
  return true
}

export type FleetActivityRow = {
  id: string
  at: string
  /** Null when the machine did it: its screen says "the machine". */
  by: { id: string; name: string } | null
  action: string
  subject: string
  announced: boolean
}

export const getFleetActivity: GetFleetActivity<void, FleetActivityRow[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const me = await prisma.user.findFirst({ where: { id: context.user.id, fleetAdmin: true, deactivatedAt: null, erasedAt: null } })
  if (!me) throw new HttpError(403, 'Only fleet admins see what fleet admins did.')
  const rows = await prisma.fleetActivity.findMany({ orderBy: { at: 'desc' }, take: PAGE })
  const people = await peopleByIds(rows.flatMap(r => (r.byUserId ? [r.byUserId] : [])))
  return rows.map(r => ({
    id: r.id,
    at: r.at.toISOString(),
    by: r.byUserId ? { id: r.byUserId, name: people.get(r.byUserId)!.name } : null,
    action: r.action,
    subject: r.subject,
    announced: r.announced,
  }))
}
