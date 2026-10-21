/**
 * The fleet admin role (host-management spec §1, §7; adr-0110): who may sign in to the Fleet Console. The first account,
 * made at install, holds it (auth/inviteAccept.ts). After that only two callers change it, and both go through here:
 *
 * - a fleet admin, in the Fleet Console, over the console link (`fleetAdmin.grant`, `fleetAdmin.revoke`);
 * - a machine admin of hq's machine, through the control socket (`fleet-admin <username>`), which is also how the role
 *   is recovered when nobody holds it.
 *
 * No operation an organisation admin reaches in hq writes it; it is its own column, apart from `UserSettings.role`.
 * Every grant and removal is announced to every fleet admin and organisation admin, and recorded.
 */
import { prisma } from 'wasp/server'
import type { FleetAdminAccount } from '@agenthix/core'
import { personById, peopleByIds } from '../server/identity/people'
import { announce } from './announce'
import { recordActivity } from './activity'
import { FLEET_ADMIN_GRANTED, FLEET_ADMIN_REMOVED } from './fleetNoticeKinds'

const ACTIVE = { deactivatedAt: null, erasedAt: null } as const

export { FLEET_ADMIN_GRANTED, FLEET_ADMIN_REMOVED }

/** Who changes the role: a fleet admin by their account, or hq's machine. */
export type RoleChanger = { userId: string } | { machine: true }

export type RoleChange =
  | { ok: true; changed: boolean; person: { id: string; name: string } }
  | { ok: false; code: 'not_found' | 'not_allowed'; message: string }

export async function isFleetAdmin(userId: string): Promise<boolean> {
  const row = await prisma.user.findFirst({ where: { id: userId, fleetAdmin: true, ...ACTIVE }, select: { id: true } })
  return row !== null
}

/** Every fleet admin still here, oldest account first. */
export async function fleetAdminIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({ where: { fleetAdmin: true, ...ACTIVE }, select: { id: true }, orderBy: { id: 'asc' } })
  return rows.map(r => r.id)
}

export async function listFleetAdmins(): Promise<FleetAdminAccount[]> {
  const rows = await prisma.user.findMany({
    where: { fleetAdmin: true, ...ACTIVE },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      fleetAdminSince: true,
      settings: { select: { role: true } },
      auth: { select: { identities: { where: { providerName: 'username' }, select: { providerUserId: true } } } },
    },
  })
  const people = await peopleByIds(rows.map(r => r.id))
  return rows.map(r => ({
    id: r.id,
    name: people.get(r.id)!.name,
    username: r.auth?.identities[0]?.providerUserId ?? '',
    organisationAdmin: r.settings?.role === 'ADMIN',
    since: r.fleetAdminSince.toISOString(),
  }))
}

const NOT_ALLOWED: RoleChange = { ok: false, code: 'not_allowed', message: 'Only a fleet admin can change who holds the fleet admin role.' }

/**
 * Grants and removals one at a time, in one transaction under a lock, so that two removals cannot each see the
 * other's fleet admin still there.
 */
async function changeRole(userId: string, by: RoleChanger, hold: boolean): Promise<RoleChange> {
  const outcome = await prisma.$transaction(async (tx): Promise<RoleChange> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('fleet-admin-role', 0))`
    const holders = await tx.user.findMany({ where: { fleetAdmin: true, ...ACTIVE }, select: { id: true } })
    if ('userId' in by && !holders.some(h => h.id === by.userId)) return NOT_ALLOWED
    const target = await tx.user.findFirst({ where: { id: userId, ...ACTIVE }, select: { id: true, fleetAdmin: true } })
    if (!target) return { ok: false, code: 'not_found', message: 'No one in HQ has that account.' }
    const person = { id: userId, name: (await personById(userId)).name }
    if (target.fleetAdmin === hold) return { ok: true, changed: false, person }
    // A fleet admin cannot remove the last one; hq's machine can, and can give it back.
    if (!hold && 'userId' in by && holders.length <= 1) {
      return { ok: false, code: 'not_allowed', message: `${person.name} is the only fleet admin; give someone else the role first.` }
    }
    await tx.user.update({ where: { id: userId }, data: hold ? { fleetAdmin: true, fleetAdminSince: new Date() } : { fleetAdmin: false } })
    return { ok: true, changed: true, person }
  }, { timeout: 15_000 })
  if (outcome.ok && outcome.changed) {
    // Whoever removed it, here or on HQ's machine: the Fleet Console would otherwise hear it only at its next check.
    if (!hold) (await import('./index')).relayHub.tellFleetAdminRemoved(userId)
    await tell(outcome.person, by, hold)
  }
  return outcome
}

async function tell(person: { id: string; name: string }, by: RoleChanger, held: boolean): Promise<void> {
  const who = 'userId' in by ? (await personById(by.userId)).name : "someone with access to HQ's machine"
  // The record's one entry for the change, whoever made it: the Fleet Console records none of its own.
  const action = held ? 'fleetAdmin.granted' : 'fleetAdmin.removed'
  // The person who lost the role is told too: they no longer hold it, so they are not among those announced to.
  await announce({
    type: held ? FLEET_ADMIN_GRANTED : FLEET_ADMIN_REMOVED,
    title: held ? `${person.name} is now a fleet admin` : `${person.name} is no longer a fleet admin`,
    body: held
      ? `Given the role by ${who}. Fleet admins look after the organisation's machines in the Fleet Console.`
      : `Removed by ${who}.`,
    actionUrl: `/org/people/${person.id}`,
  }, held ? [] : [person.id])
  await recordActivity({ byUserId: 'userId' in by ? by.userId : null, action, subject: person.name, at: new Date(), announce: false })
}

export function grantFleetAdmin(userId: string, by: RoleChanger): Promise<RoleChange> {
  return changeRole(userId, by, true)
}

export function revokeFleetAdmin(userId: string, by: RoleChanger): Promise<RoleChange> {
  return changeRole(userId, by, false)
}

/** For the control socket, which names a person by the username they sign in with. */
export async function userIdForUsername(username: string): Promise<string | null> {
  const identity = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username.toLowerCase() } },
    select: { auth: { select: { userId: true } } },
  })
  return identity?.auth.userId ?? null
}
