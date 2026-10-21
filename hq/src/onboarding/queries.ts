import { HttpError, prisma } from 'wasp/server'
import { personById } from '../server/identity/people'
import { readPublicOrgIdentity, readOrgCard, type PublicOrgIdentity } from '../org/publicIdentity'
import { invitedProjects } from '../auth/inviteGlimpse'
import { computeModelAccessGap } from '../model-access/modelAccessGap'
import { needsSetup } from '../setup/setupState'

export type OnboardingData = {
  /** The organisation as the sign-in page shows it, which is how every onboarding screen carries it. */
  identity: PublicOrgIdentity
  orgName: string
  me: { id: string; displayName: string | null; username: string | null; avatarUrl: string | null; timezone: string | null }
  role: 'ADMIN' | 'MEMBER'
  invitedBy: string | null
  /** What the invitation added, in the order named; the first is where they land. */
  projects: { key: string; name: string }[]
  /** Neither the organisation nor their projects give them model access, so the step is theirs. */
  needsModel: boolean
  /** The first-admin account belongs to setup, never to onboarding. */
  needsSetup: boolean
  landAt: string
}

/**
 * What onboarding shows an invited person: themselves, the organisation, and
 * what the invitation they accepted made them part of. Read each time; nothing
 * is stored for it, so a person who leaves midway simply lands on Home next time.
 */
export const getOnboardingData = async (_args: void, context: { user?: { id: string } | null }): Promise<OnboardingData> => {
  if (!context.user) throw new HttpError(401)
  const userId = context.user.id

  const [identity, card, person, summary, settings, invite, gap, setup] = await Promise.all([
    readPublicOrgIdentity(),
    readOrgCard(),
    prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, avatarUrl: true } }),
    personById(userId),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true, timezone: true } }),
    prisma.invite.findFirst({ where: { consumedBy: userId, kind: 'INVITATION' }, select: { createdBy: true, projectIds: true } }),
    computeModelAccessGap(),
    needsSetup(userId),
  ])
  const [inviter, projects] = await Promise.all([
    invite?.createdBy ? personById(invite.createdBy) : null,
    invitedProjects(invite?.projectIds ?? []),
  ])
  const named = projects.map(p => ({ key: p.key, name: p.name }))

  return {
    identity,
    orgName: card.name,
    me: { id: userId, displayName: person?.displayName ?? null, username: summary.handle, avatarUrl: person?.avatarUrl ?? null, timezone: settings?.timezone ?? null },
    role: settings?.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
    invitedBy: inviter && inviter.state !== 'erased' ? inviter.name : null,
    projects: named,
    needsModel: gap.missing,
    needsSetup: setup,
    landAt: named[0] ? `/projects/${named[0].key}` : '/',
  }
}
