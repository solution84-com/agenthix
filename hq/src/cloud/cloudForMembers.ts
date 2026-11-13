/**
 * What hq's own screens read and say of Agenthix Cloud to its people (pre-release spec part D): whether signing in with
 * an Agenthix account works and is linked, a member's one ask of a fleet admin, where hq runs, and the offers a fleet
 * admin may dismiss. None of it calls Cloud: it reads hq's own records.
 */
import { HttpError, prisma } from 'wasp/server'
import type {
  AskForCloudSignIn, DismissCloudOffer, GetMyCloudOffers, GetMyCloudSignIn, GetWhereHqRuns,
} from 'wasp/server/operations'
import { CLOUD_OFFERS, type CloudOffer } from '../shared/cloudLinks'
import { requireFeature } from '../features/requireFeature'
import { cloudBaseUrl, cloudConnection, runByCloud } from '.'

const ACTIVE = { deactivatedAt: null, erasedAt: null } as const

export type MyCloudSignIn = { connected: boolean; linked: boolean; asked: boolean; cloudOrigin: string | null }
export type WhereHqRuns = { hosting: 'self' | 'cloud'; connectedAs: string | null }
export type MyCloudOffers = { fleetAdmin: boolean; dismissed: CloudOffer[]; cloudOrigin: string | null }

type Ctx = { user?: { id: string } | null }

function signedIn(context: Ctx): string {
  if (!context.user) throw new HttpError(401)
  return context.user.id
}

const cloudOrigin = (): string | null => cloudBaseUrl()?.origin ?? null

async function connectedAs(): Promise<string | null> {
  return (await cloudConnection()?.state())?.connection?.name ?? null
}

export const getMyCloudSignIn: GetMyCloudSignIn<void, MyCloudSignIn> = async (_args, context) => {
  await requireFeature('cloud')
  const userId = signedIn(context)
  const [as, link, ask] = await Promise.all([
    connectedAs(),
    prisma.cloudAccountLink.findUnique({ where: { userId }, select: { userId: true } }),
    prisma.cloudSignInAsk.findUnique({ where: { userId }, select: { userId: true } }),
  ])
  return { connected: as !== null, linked: link !== null, asked: ask !== null, cloudOrigin: cloudOrigin() }
}

/** Once per person, for good: a second call changes nothing. Refused while hq is connected, when there is nothing to ask for. */
export const askForCloudSignIn: AskForCloudSignIn<void, { asked: true }> = async (_args, context) => {
  await requireFeature('cloud')
  const userId = signedIn(context)
  if ((await connectedAs()) !== null) throw new HttpError(409, 'HQ is connected to Agenthix Cloud, so there is nothing to ask for.')
  await prisma.cloudSignInAsk.upsert({ where: { userId }, create: { userId }, update: {} })
  return { asked: true }
}

/** Where hq runs: on a machine Agenthix Cloud runs when its host service says so (`runByCloud`). */
export const getWhereHqRuns: GetWhereHqRuns<void, WhereHqRuns> = async (_args, context) => {
  await requireFeature('cloud')
  signedIn(context)
  return { hosting: runByCloud() ? 'cloud' : 'self', connectedAs: await connectedAs() }
}

export const getMyCloudOffers: GetMyCloudOffers<void, MyCloudOffers> = async (_args, context) => {
  await requireFeature('cloud')
  const userId = signedIn(context)
  const [user, rows] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, ...ACTIVE }, select: { fleetAdmin: true } }),
    prisma.offerDismissal.findMany({ where: { userId }, select: { offer: true } }),
  ])
  const dismissed = rows.map(r => r.offer).filter((o): o is CloudOffer => (CLOUD_OFFERS as readonly string[]).includes(o))
  return { fleetAdmin: user?.fleetAdmin === true, dismissed, cloudOrigin: cloudOrigin() }
}

/** Per person and per offer, for good. Only a fleet admin has offers to dismiss. */
export const dismissCloudOffer: DismissCloudOffer<{ offer: string }, { dismissed: true }> = async (args, context) => {
  await requireFeature('cloud')
  const userId = signedIn(context)
  if (!(CLOUD_OFFERS as readonly string[]).includes(args?.offer)) throw new HttpError(400, 'That is not an offer.')
  if (!(await prisma.user.count({ where: { id: userId, fleetAdmin: true, ...ACTIVE } }))) throw new HttpError(403, 'Only a fleet admin has offers to dismiss.')
  await prisma.offerDismissal.upsert({
    where: { userId_offer: { userId, offer: args.offer } },
    create: { userId, offer: args.offer },
    update: {},
  })
  return { dismissed: true }
}
