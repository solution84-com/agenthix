/**
 * The three one-time links Agenthix Cloud's controller may ask for, on a machine Cloud runs (pre-release spec B7;
 * adr-0133). The host service there passes them over hq's control socket only once the request came sealed from
 * Cloud's pinned identity (cloudMachineCommands.ts). Each reuses hq's own mechanism — the first-admin key, the password
 * reset, the admin invitation — so there is no second token scheme.
 *
 * Links are https only and never logged; every one made is announced to every admin, as done from Cloud. The reset
 * link's refusal reads the same whether or not the account exists.
 */
import { prisma } from 'wasp/server'
import { BRANDING, type CloudLink, type CloudOnlyResults, type FirstAdminMadeWith } from '@agenthix/core'
import { generateInviteToken, hashInviteToken } from '../inviteToken'
import { FIRST_ADMIN_TTL_MS, issueFirstAdminLink, lockFirstAdmin } from '../firstAdmin'
import { hqAddress, invitationLink } from '../hqLinks'
import { makePasswordReset } from '../passwordReset'
import { personById } from '../../server/identity/people'
import { announce } from '../../fleet/announce'

export const CLOUD_ACCOUNT_LINK_NOTIFICATION = 'account_link_from_cloud'

const CLOUD = `${BRANDING.displayName} Cloud`

export type CloudLinkRefusalCode = 'not_found' | 'conflict'

export class CloudLinkRefusal extends Error {
  constructor(readonly code: CloudLinkRefusalCode, message: string) {
    super(message)
    this.name = 'CloudLinkRefusal'
  }
}

const NO_SUCH_ADMIN = 'No active organisation admin signs in with that username.'

/** Checked before anything is made, so a refusal leaves the link before it working. */
function requireHttps(): void {
  if (!hqAddress().startsWith('https://')) {
    throw new CloudLinkRefusal('conflict', `HQ's address is not an https address, so it makes no link for ${CLOUD}.`)
  }
}

const activeAdmin = { deactivatedAt: null, erasedAt: null, settings: { role: 'ADMIN' as const } }

type FirstLinkResult = CloudOnlyResults['account.firstLink']

/**
 * The first admin is whoever the first-admin link made, when one did; otherwise (made some other way, such as at install
 * before these links) the account hq has held longest, by when its settings were made.
 */
async function whoWasFirst(): Promise<Extract<FirstLinkResult, { state: 'hasAccounts' }>> {
  const [accounts, key, oldest] = await Promise.all([
    prisma.user.count(),
    prisma.invite.findFirst({
      where: { kind: 'FIRST_ADMIN', consumedAt: { not: null } }, orderBy: { consumedAt: 'asc' }, select: { consumedAt: true, linkRef: true },
    }),
    prisma.userSettings.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ])
  const madeAt = key?.consumedAt ?? oldest?.createdAt ?? new Date(0)
  const madeWith: FirstAdminMadeWith = key?.linkRef ? { kind: 'firstLink', ref: key.linkRef } : { kind: 'other' }
  return { state: 'hasAccounts', accounts, firstAdmin: { madeAt: madeAt.toISOString(), madeWith } }
}

/** A fresh first-admin link while hq has no account, ending the one before; once it has one, who was made first. */
export async function cloudFirstLink(ref: string, now = new Date()): Promise<FirstLinkResult> {
  if ((await prisma.user.count()) > 0) return whoWasFirst()
  requireHttps()
  const issued = await issueFirstAdminLink(now, ref)
  if (!issued) return whoWasFirst()
  await announce({
    type: CLOUD_ACCOUNT_LINK_NOTIFICATION,
    title: `${CLOUD} made a link to set up the first admin`,
    body: `${CLOUD} made a one-time link to make HQ's first admin account.`,
  })
  return { link: issued.link, expiresAt: issued.expiresAt.toISOString() }
}

/** A one-time link to set an active organisation admin's password; anyone else is refused in the same words. */
export async function cloudResetLink(username: string, now = new Date()): Promise<CloudLink> {
  requireHttps()
  const identity = await prisma.authIdentity.findUnique({
    where: { providerName_providerUserId: { providerName: 'username', providerUserId: username.toLowerCase() } },
    select: { auth: { select: { userId: true } } },
  })
  const userId = identity?.auth.userId
  const admin = userId ? await prisma.user.findFirst({ where: { id: userId, ...activeAdmin }, select: { id: true } }) : null
  if (!admin) throw new CloudLinkRefusal('not_found', NO_SUCH_ADMIN)
  let made
  try {
    made = await makePasswordReset(admin.id, null, now)
  } catch {
    throw new CloudLinkRefusal('not_found', NO_SUCH_ADMIN)
  }
  const person = await personById(admin.id)
  const who = person.handle ? `${person.name} (@${person.handle})` : person.name
  await announce({
    type: CLOUD_ACCOUNT_LINK_NOTIFICATION,
    title: `${CLOUD} made a link to reset ${person.name}'s password`,
    body: `${CLOUD} made a one-time link to set ${who}'s password.`,
    actionUrl: `/admin/people/${admin.id}`,
  })
  return { link: made.link, expiresAt: made.expiresAt.toISOString() }
}

/** An invitation for a new organisation admin, only while no active one is left. */
export async function cloudAdminInvite(now = new Date()): Promise<CloudLink> {
  requireHttps()
  const token = generateInviteToken()
  const expiresAt = new Date(now.getTime() + FIRST_ADMIN_TTL_MS)
  await prisma.$transaction(async tx => {
    // The same lock as making the first admin, so an account cannot appear between the check and the invitation.
    await lockFirstAdmin(tx)
    if ((await tx.user.count()) === 0) {
      throw new CloudLinkRefusal('conflict', 'HQ has no accounts yet: make the first admin with the first admin\'s link.')
    }
    if ((await tx.user.count({ where: activeAdmin })) > 0) {
      throw new CloudLinkRefusal('conflict', 'HQ still has an active organisation admin, who can invite another.')
    }
    await tx.invite.create({
      data: { kind: 'INVITATION', tokenHash: hashInviteToken(token), role: 'ADMIN', createdBy: null, expiresAt },
    })
  })
  await announce({
    type: CLOUD_ACCOUNT_LINK_NOTIFICATION,
    title: `${CLOUD} made an invitation for a new organisation admin`,
    body: `HQ had no active organisation admin left, so ${CLOUD} made a one-time invitation to join as one.`,
    actionUrl: '/admin/people?show=invitations',
  })
  return { link: invitationLink(token), expiresAt: expiresAt.toISOString() }
}
