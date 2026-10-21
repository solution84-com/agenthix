import { HttpError, prisma } from 'wasp/server'
import { needsSetup } from './setupState'
import { hqSiteState, type HqSiteState } from './hqSiteState'

type SetupData = {
  org: { id: string; name: string; handle: string | null; vision: string; mission: string; avatarUrl: string | null; coverUrl: string | null } | null
  /** Setup still waits on this person: true only for hq's first admin until they finish it. */
  needsSetup: boolean
  /** The opposite of `needsSetup`, kept for the pages that redirect on it. */
  setupComplete: boolean
  isAdmin: boolean
  /** Whether hq's own site is running, for setup's Model access step. */
  hqSite: HqSiteState
  /** The signed-in person, for setup's first step to review. */
  me: { id: string; displayName: string | null; username: string | null }
}

export const getSetupData = async (_args: void, context: { user?: { id: string } | null }): Promise<SetupData> => {
  if (!context.user) throw new HttpError(401)

  const [org, userSettings, setup, hqSite, person] = await Promise.all([
    prisma.org.findFirst(),
    prisma.userSettings.findUnique({ where: { userId: context.user.id }, select: { role: true } }),
    needsSetup(context.user.id),
    hqSiteState(),
    prisma.user.findUnique({
      where: { id: context.user.id },
      select: { displayName: true, auth: { select: { identities: { where: { providerName: 'username' }, select: { providerUserId: true } } } } },
    }),
  ])

  return {
    org: org
      ? { id: org.id, name: org.name, handle: org.handle, vision: org.vision, mission: org.mission, avatarUrl: org.avatarUrl, coverUrl: org.coverUrl }
      : null,
    needsSetup: setup,
    setupComplete: !setup,
    isAdmin: userSettings?.role === 'ADMIN',
    hqSite,
    me: { id: context.user.id, displayName: person?.displayName ?? null, username: person?.auth?.identities[0]?.providerUserId ?? null },
  }
}
