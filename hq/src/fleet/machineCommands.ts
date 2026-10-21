/**
 * The control-socket commands of host management (host-management spec §9), for a machine admin of hq's machine:
 *
 * - `fleet-admin <username>`: gives that account the fleet admin role — how the role is recovered when nobody holds
 *   it; `fleet-admin --remove <username>` takes it away. Announced either way.
 * - `console-code`: a one-time code, for one hour, that lets the Fleet Console run on another machine.
 * - `fleet-admin-id <username>`: the id of an active fleet admin, which the Fleet Console keys their authenticator by.
 */
import { prisma } from 'wasp/server'
import { BRANDING } from '@agenthix/core'
import type { CommandResult } from '../auth/machine/hqMachineCommands'
import { grantFleetAdmin, revokeFleetAdmin, userIdForUsername } from './fleetAdminRole'
import { issueConsoleCode } from './consoleCredential'

const FLEET_ADMIN_USAGE = 'Usage: fleet-admin <username>, or fleet-admin --remove <username>'

export async function fleetAdminCommand(args: string[]): Promise<CommandResult> {
  const remove = args[0] === '--remove'
  const username = (remove ? args[1] : args[0])?.trim()
  if (!username || username.startsWith('-') || args.length > (remove ? 2 : 1)) return { ok: false, error: FLEET_ADMIN_USAGE, code: 'usage' }
  const userId = await userIdForUsername(username)
  if (!userId) return { ok: false, error: `No one signs in as '${username}'.`, code: 'not_found' }
  const change = remove ? await revokeFleetAdmin(userId, { machine: true }) : await grantFleetAdmin(userId, { machine: true })
  if (!change.ok) return { ok: false, error: change.message, code: change.code === 'not_found' ? 'not_found' : undefined }
  const name = `${change.person.name} (${username})`
  const told = 'Every fleet admin and organisation admin has been told.'
  const text = remove
    ? change.changed ? `${name} no longer holds the fleet admin role. ${told}` : `${name} did not hold the fleet admin role; nothing changed.`
    : change.changed ? `${name} now holds the fleet admin role and can sign in to the Fleet Console. ${told}` : `${name} already holds the fleet admin role; nothing changed.`
  return { ok: true, text, data: { userId, fleetAdmin: !remove, changed: change.changed } }
}

export async function consoleCodeCommand(now = new Date()): Promise<CommandResult> {
  const { code, expiresAt } = await issueConsoleCode(now)
  return {
    ok: true,
    text: `A one-time code for the Fleet Console on another machine (works once, for 1 hour): ${code}\n` +
      `On that machine: ${BRANDING.cliCommand} console install <hq address> ${code}\n` +
      'Once the Fleet Console on the other machine connects, HQ no longer lets in the one here: it is retired.',
    data: { code, expiresAt: expiresAt.toISOString() },
  }
}

export async function fleetAdminIdCommand(args: string[], db = prisma): Promise<CommandResult> {
  const username = args[0]?.trim()
  if (!username || args.length !== 1) return { ok: false, error: 'Usage: fleet-admin-id <username>', code: 'usage' }
  const userId = await userIdForUsername(username)
  const admin = userId ? await db.user.findFirst({ where: { id: userId, fleetAdmin: true, deactivatedAt: null, erasedAt: null }, select: { id: true } }) : null
  if (!admin) return { ok: false, error: `No active fleet admin signs in as '${username}'.`, code: 'not_found' }
  return { ok: true, text: admin.id, data: { userId: admin.id } }
}
