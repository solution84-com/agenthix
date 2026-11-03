/**
 * What someone who can run commands on hq's machine may do (getting-in spec,
 * Getting back in): the same proof of control a site's `agenthix-site` command
 * relies on. Reached only through the control socket (`controlSocket.ts`),
 * which only a process on hq's machine can open.
 *
 * - `invite-admin`: while hq has no users, a fresh first-admin link; once it
 *   has some, an admin invitation recorded as made on hq's machine — for when
 *   no admin can get in.
 * - `reset-password <username>`: a one-time reset link, and a notification to
 *   every other admin that a password was reset from hq's machine.
 * - `status`: whether hq has people yet, how many agents are working, and
 *   whether its own site is connected and, if not, why — for the installer to
 *   wait on and `agenthix status` to put in sentences; and hq's version,
 *   which its public `/health` no longer gives (adr-0106).
 * - `default-site-cause <cause>`: why its own site is not connected, which
 *   only the host service on hq's machine can see; `none` clears it.
 * - `scheduled-change <notice>`: a notice of a change scheduled on hq's machine,
 *   from the host service that holds it (host-management spec §14).
 * - `fleet-admin [--remove] <username>` and `console-code`: host management's
 *   (fleet/machineCommands.ts).
 * - `address-move <address>`: hq is about to move to that address; it tells its
 *   sites, host services and people (fleet/addressMove.ts).
 * - `read-only …` and `transfer-open …`: hq moving to a new machine (fleet/hqMove.ts).
 * - `cloud-…`: Agenthix Cloud's sites and account links, passed on by the host service on a machine Cloud runs
 *   (cloudMachineCommands.ts).
 * - `cloud-connection connect|state|disconnect`: the organisation's connection to Cloud, from hq's machine
 *   (cloud/machineCommands.ts).
 * - `fleet-admin-id <username>`: the id of an active fleet admin, for the Fleet Console's `console reset-code`.
 * - `provider add|list|remove`: the organisation's providers, with the actor *machine* (providers/machineCommands.ts).
 *   Once Cloud's controller has connected hq on a machine Cloud runs, Agenthix Cloud is supplied as a provider.
 *
 * Each answers its facts as `data` as well as in words, so a caller never has
 * to read them out of the text.
 */
import { prisma } from 'wasp/server'
import { generateInviteToken, hashInviteToken } from '../inviteToken'
import { issueFirstAdminLink, FIRST_ADMIN_TTL_MS } from '../firstAdmin'
import { hqAddress, invitationLink } from '../hqLinks'
import { makePasswordReset } from '../passwordReset'
import { peopleByIds, personById } from '../../server/identity/people'
import { hqSiteState, type HqSiteState } from '../../setup/hqSiteState'
import { causeSentence, reportDefaultSiteCause } from '../../sites/defaultSiteCause'
import { activeRunCount } from '../../sites/activeRuns'
import { BUILD_INFO } from '../../server/buildInfo'
import { BRANDING } from '@agenthix/core'
import { recordScheduledChangeNotice } from '../../sites/scheduled/scheduledChanges'
import { fleetAdminCommand, consoleCodeCommand } from '../../fleet/machineCommands'
import { addressMoveCommand } from '../../fleet/addressMove'
import { readOnlyCommand, transferOpenOnRelay } from '../../fleet/hqMove'
import { notificationsChanged } from '../../server/personEvents'
import { isCloudMachineCommand, runCloudMachineCommand } from './cloudMachineCommands'
import { cloudConnectionCommand } from '../../cloud/machineCommands'
import { fleetAdminIdCommand } from '../../fleet/machineCommands'
import { providerCommand, supplyCloudAfterConnect } from '../../providers/machineCommands'

export const MACHINE_RESET_NOTIFICATION = 'password_reset_from_hq_machine'
export const MACHINE_ADMIN_INVITE_NOTIFICATION = 'admin_invited_from_hq_machine'

/** `code` says what kind of refusal it is, so a caller never matches the words: `not_found`, `conflict`, `usage`, `unknown`. */
export type CommandResult =
  | { ok: true; text: string; data?: Record<string, unknown> }
  | { ok: false; error: string; code?: 'not_found' | 'conflict' | 'usage' | 'unknown' }

/** What a link command answers as data. `toldAdmins` are the names of the admins who were told. */
export type LinkData =
  | { kind: 'first_admin'; link: string; validHours: number }
  | { kind: 'invitation'; link: string; validHours: number; toldAdmins: string[] }
  | { kind: 'password_reset'; link: string; validHours: number; person: { name: string; handle: string | null }; toldAdmins: string[] }

export async function inviteAdminCommand(now = new Date()): Promise<CommandResult> {
  const first = await issueFirstAdminLink(now)
  if (first) {
    const data: LinkData = { kind: 'first_admin', link: first.link, validHours: 24 }
    return { ok: true, text: `No admin yet. Open this link to set up ${BRANDING.displayName} (valid 24 hours):\n${first.link}`, data }
  }
  const token = generateInviteToken()
  await prisma.invite.create({
    data: {
      kind: 'INVITATION',
      tokenHash: hashInviteToken(token),
      role: 'ADMIN',
      createdBy: null,
      expiresAt: new Date(now.getTime() + FIRST_ADMIN_TTL_MS),
    },
  })
  const toldAdmins = await tellAdmins(null, {
    type: MACHINE_ADMIN_INVITE_NOTIFICATION,
    title: "An admin was invited from HQ's machine",
    body: "Someone with access to HQ's machine made an invitation to join as an admin.",
    actionUrl: '/admin/people?show=invitations',
  })
  const link = invitationLink(token)
  const data: LinkData = { kind: 'invitation', link, validHours: 24, toldAdmins }
  return { ok: true, text: `An admin invitation, recorded as made on HQ's machine (valid 24 hours):\n${link}`, data }
}

export async function resetPasswordCommand(username: string | undefined, now = new Date()): Promise<CommandResult> {
  if (!username) return { ok: false, error: 'Usage: reset-password <username>', code: 'usage' }
  const identity = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username.toLowerCase() } },
    select: { auth: { select: { userId: true } } },
  })
  const userId = identity?.auth.userId
  if (!userId) return { ok: false, error: `No one signs in as '${username}'.`, code: 'not_found' }

  let made
  try {
    made = await makePasswordReset(userId, null, now)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const person = await personById(userId)
  const who = person.handle ? `${person.name} (@${person.handle})` : person.name
  const toldAdmins = await tellAdmins(userId, {
    type: MACHINE_RESET_NOTIFICATION,
    title: "A password was reset from HQ's machine",
    body: `Someone with access to HQ's machine made a link to set ${who}'s password.`,
    actionUrl: `/admin/people/${userId}`,
  })
  const data: LinkData = {
    kind: 'password_reset', link: made.link, validHours: 1, person: { name: person.name, handle: person.handle }, toldAdmins,
  }
  return { ok: true, text: `A one-time link to set ${username}'s password (valid 1 hour):\n${made.link}`, data }
}

/** Every active admin but `except`, told what was done from hq's machine; their names. */
async function tellAdmins(except: string | null, notice: { type: string; title: string; body: string; actionUrl: string }): Promise<string[]> {
  const admins = await prisma.userSettings.findMany({
    where: { role: 'ADMIN', ...(except ? { userId: { not: except } } : {}), user: { deactivatedAt: null, erasedAt: null } },
    select: { userId: true },
  })
  if (admins.length === 0) return []
  await prisma.notification.createMany({
    data: admins.map(a => ({ userId: a.userId, ...notice, actionLabel: 'Open' })),
  })
  notificationsChanged(admins.map(a => a.userId))
  const people = await peopleByIds(admins.map(a => a.userId))
  return admins.map(a => people.get(a.userId)?.name ?? '').filter(Boolean)
}

export type HqStatus = {
  users: number
  /** Runs hq has seen start and not end, on every site. */
  runningAgents: number
  hqSite: HqSiteState
  address: string
  version: string
}

const SITE = "HQ's site"

function siteSentence(site: HqSiteState): string {
  switch (site.state) {
    case 'connected': return `${SITE} is connected.`
    case 'upgrade': return `${SITE} is not connected: HQ and the site run versions that do not work together.`
    case 'unpaired': return `${SITE} is not set up: HQ holds no pairing secret.`
    case 'notConnected':
      return site.cause ? `${SITE} is not connected. ${causeSentence(site.cause)}` : `${SITE} is not connected, and why is not known yet.`
  }
}

function peopleSentence(users: number, running: number): string {
  const people = users === 0 ? 'No one has an account yet' : users === 1 ? '1 person has an account' : `${users} people have accounts`
  return `${people}; ${running === 1 ? '1 agent is' : `${running} agents are`} working.`
}

export async function statusCommand(): Promise<CommandResult> {
  const [users, site] = await Promise.all([prisma.user.count(), hqSiteState()])
  const data: HqStatus = {
    users, runningAgents: activeRunCount(), hqSite: site, address: hqAddress(), version: BUILD_INFO.version,
  }
  return {
    ok: true,
    text: `HQ ${data.version} at ${data.address}. ${peopleSentence(users, data.runningAgents)} ${siteSentence(site)}`,
    data,
  }
}

export function defaultSiteCauseCommand(cause: string | undefined, now = new Date()): CommandResult {
  const kept = cause ? reportDefaultSiteCause(cause, now) : null
  if (!kept) return { ok: false, error: 'Usage: default-site-cause <cause>, one HQ knows, or none', code: 'usage' }
  return { ok: true, text: kept === 'none' ? 'Cleared.' : causeSentence(kept), data: { cause: kept } }
}

export async function scheduledChangeCommand(json: string | undefined): Promise<CommandResult> {
  let notice: unknown
  try {
    notice = json ? JSON.parse(json) : undefined
  } catch {
    notice = undefined
  }
  if (notice === undefined) return { ok: false, error: 'Usage: scheduled-change <notice as JSON>', code: 'usage' }
  const kept = await recordScheduledChangeNotice(notice, { from: 'hqMachine' })
  return { ok: true, text: kept ? 'Taken.' : 'Not newer than what HQ has, or not a notice; nothing changed.', data: { kept } }
}

/** The control socket's handler: one command, by name. */
export async function runHqMachineCommand(command: string, args: string[]): Promise<CommandResult> {
  if (isCloudMachineCommand(command)) {
    const result = await runCloudMachineCommand(command, args)
    if (result.ok && command === 'cloud-organisation-connect') await supplyCloudAfterConnect()
    return result
  }
  switch (command) {
    case 'invite-admin':
      return inviteAdminCommand()
    case 'reset-password':
      return resetPasswordCommand(args[0])
    case 'status':
      return statusCommand()
    case 'default-site-cause':
      return defaultSiteCauseCommand(args[0])
    case 'scheduled-change':
      return scheduledChangeCommand(args[0])
    case 'fleet-admin':
      return fleetAdminCommand(args)
    case 'console-code':
      return consoleCodeCommand()
    case 'cloud-connection':
      return cloudConnectionCommand(args)
    case 'fleet-admin-id':
      return fleetAdminIdCommand(args)
    case 'address-move':
      return addressMoveCommand(args)
    case 'read-only':
      return readOnlyCommand(args)
    case 'transfer-open':
      return transferOpenOnRelay(args)
    case 'provider':
      return providerCommand(args)
    default:
      return {
        ok: false,
        error: `Unknown command '${command}'. Commands: invite-admin, reset-password <username>, status, default-site-cause <cause>, scheduled-change <notice>, fleet-admin [--remove] <username>, console-code, address-move <address>, read-only [on [<machine>] | off], transfer-open <transferId> <from> <to>, provider add|list|remove.`,
        code: 'unknown',
      }
  }
}
