/**
 * The Responsible AI Pledge card on Home and a person's own signature in Settings (pre-release spec part D). Without a
 * linked Agenthix account hq knows nothing of the person's pledge and asks no one: the card invites them to the
 * pledge's page until they dismiss it. With one, hq asks Cloud whether they signed (cloud/pledgeStatus.ts): signed the
 * current version, there is no card; not signed, the card takes them straight to signing on Cloud; signed an earlier
 * version, a card about the new one comes back once, even to someone who dismissed the first.
 */
import { HttpError, prisma } from 'wasp/server'
import type { DismissPledge, GetMyPledge, GetPledgeCard } from 'wasp/server/operations'
import { PLEDGE_PAGE_URL, cloudPledgeSignUrl, cloudPledgeSignerPage } from '@agenthix/core'
import { cloudBaseUrl, cloudPledgeStatuses } from '../cloud'
import type { MyPledge, PledgeCardView } from '../shared/homeTypes'

function signedIn(context: { user?: { id: string } | null }): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

export const getPledgeCard: GetPledgeCard<void, PledgeCardView> = async (_args, context) => {
  const userId = signedIn(context)
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { pledgeDismissedAt: true, pledgeVersionDismissed: true } })
  if (!person) return { kind: 'none' }
  const standing = await cloudPledgeStatuses().of(userId)
  const base = cloudBaseUrl()
  if (standing.kind === 'signed') {
    if (standing.version >= standing.currentVersion || !base) return { kind: 'none' }
    if ((person.pledgeVersionDismissed ?? 0) >= standing.currentVersion) return { kind: 'none' }
    return { kind: 'newVersion', signedVersion: standing.version, currentVersion: standing.currentVersion, signUrl: cloudPledgeSignUrl(base) }
  }
  if (person.pledgeDismissedAt) return { kind: 'none' }
  if (standing.kind === 'notSigned' && !standing.withdrawn && base) {
    return { kind: 'inviteLinked', pageUrl: PLEDGE_PAGE_URL, signUrl: cloudPledgeSignUrl(base) }
  }
  return { kind: 'invite', pageUrl: PLEDGE_PAGE_URL }
}

/** `newVersion`: the version a new-version card named, dismissed for that version alone; otherwise the invitation. */
export const dismissPledge: DismissPledge<{ newVersion?: number } | void, { dismissed: true }> = async (args, context) => {
  const userId = signedIn(context)
  const version = args && typeof args.newVersion === 'number' && Number.isInteger(args.newVersion) && args.newVersion >= 1 ? args.newVersion : null
  if (args && args.newVersion !== undefined && version === null) throw new HttpError(400, 'newVersion must be a version number.')
  if (version !== null) {
    await prisma.user.updateMany({
      where: { id: userId, OR: [{ pledgeVersionDismissed: null }, { pledgeVersionDismissed: { lt: version } }] },
      data: { pledgeVersionDismissed: version },
    })
  } else {
    await prisma.user.updateMany({ where: { id: userId, pledgeDismissedAt: null }, data: { pledgeDismissedAt: new Date() } })
  }
  return { dismissed: true }
}

/** Settings › Sign-in: the person's own signature, when their linked account has one. Never shown to anyone else. */
export const getMyPledge: GetMyPledge<void, MyPledge> = async (_args, context) => {
  const userId = signedIn(context)
  const standing = await cloudPledgeStatuses().of(userId)
  const base = cloudBaseUrl()
  if (standing.kind !== 'signed' || !base) return null
  return { version: standing.version, currentVersion: standing.currentVersion, badgeUrl: cloudPledgeSignerPage(base, standing.signerId) }
}
