/**
 * The policy's actors and targets read from hq's records, and the check every Wasp operation makes with them
 * (`policy.ts`). An account's organisation role is its `UserSettings.role`; a Library maintainer has a
 * `LibraryMaintainer` row; a project role is its `ProjectMember` row.
 */
import { HttpError, prisma } from 'wasp/server'
import type { Db } from '../packages/packageStore'
import { assertMay, PolicyError, type AssetAction, type PersonActor, type PolicyTarget } from './policy'

/** A person who left (deactivated) or has no account here holds nothing, whatever their rows say. */
export async function personActor(userId: string, db: Db, projectId?: string): Promise<PersonActor> {
  const [user, settings, maintainer, member] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } }),
    db.userSettings.findUnique({ where: { userId }, select: { role: true } }),
    db.libraryMaintainer.findUnique({ where: { userId }, select: { userId: true } }),
    projectId ? db.projectMember.findFirst({ where: { projectId, userId }, select: { role: true } }) : null,
  ])
  if (!user || user.deactivatedAt) return { kind: 'person', userId, role: null, libraryMaintainer: false, projectRole: null }
  return { kind: 'person', userId, role: settings?.role ?? null, libraryMaintainer: maintainer !== null, projectRole: member?.role ?? null }
}

export async function organisationTarget(db: Db): Promise<Extract<PolicyTarget, { level: 'organisation' }>> {
  const org = await db.org.findFirst({ select: { outsideInstallers: true } })
  return { level: 'organisation', outsideInstallers: org?.outsideInstallers ?? 'ADMINS' }
}

/** 401 without a person, 403 with the policy's refusal when they may not. Returns the actor for later checks. */
export async function requireMay(
  context: { user?: { id: string } | null },
  action: AssetAction,
  target: PolicyTarget,
  db: Db = prisma,
): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  const actor = await personActor(context.user.id, db, target.level === 'project' ? target.projectId : undefined)
  try {
    assertMay(actor, action, target)
  } catch (err) {
    if (err instanceof PolicyError) throw new HttpError(403, err.message)
    throw err
  }
  return actor
}
