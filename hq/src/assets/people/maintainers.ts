/**
 * Library maintainers (spec part 2 *History and Library maintainers*, D28; security review M1): an organisation role
 * beside administrators, named and removed by administrators only. Naming someone shows the role's reach first and
 * goes ahead only once that is confirmed. When a member leaves, the role is dropped (`settings/leaving.ts`) and the
 * history, which names people by id, still names them.
 */
import { HttpError, prisma } from 'wasp/server'
import { organisationTarget, requireMay } from '../policyActors'

type Ctx = { user?: { id: string } | null }

const NOTHING = 'Nothing was changed.'

/** Shown before naming anyone, and confirmed (M1). */
export const MAINTAINER_REACH =
  "Library maintainers publish skills that run for every agent, in every project, including ones they can't access."

export type MaintainerView = { userId: string; namedById: string | null; since: string }

export type NameMaintainerResult =
  | { named: false; reach: string }
  | { named: true; reach: string; maintainer: MaintainerView }

const viewOf = (row: { userId: string; namedById: string | null; createdAt: Date }): MaintainerView =>
  ({ userId: row.userId, namedById: row.namedById, since: row.createdAt.toISOString() })

async function requireNaming(context: Ctx) {
  return requireMay(context, 'nameMaintainer', await organisationTarget(prisma))
}

export const listLibraryMaintainers = async (_args: unknown, context: Ctx): Promise<MaintainerView[]> => {
  await requireNaming(context)
  const rows = await prisma.libraryMaintainer.findMany({
    where: { user: { deactivatedAt: null } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(viewOf)
}

/** Without `reachConfirmed`, only the reach to show; with it, the person is named. */
export const nameLibraryMaintainer = async (
  args: { userId?: unknown; reachConfirmed?: unknown },
  context: Ctx,
): Promise<NameMaintainerResult> => {
  const actor = await requireNaming(context)
  if (typeof args?.userId !== 'string') throw new HttpError(400, `Choose who to name. ${NOTHING}`)
  const userId = args.userId
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { deactivatedAt: true } }),
    prisma.userSettings.findUnique({ where: { userId }, select: { role: true } }),
  ])
  if (!user || user.deactivatedAt || !settings?.role) throw new HttpError(404, `That person isn't a member of this organisation. ${NOTHING}`)
  if (settings.role === 'ADMIN') throw new HttpError(409, `An administrator already does everything a Library maintainer does. ${NOTHING}`)
  if (args.reachConfirmed !== true) return { named: false, reach: MAINTAINER_REACH }
  const row = await prisma.libraryMaintainer.upsert({
    where: { userId },
    create: { userId, namedById: actor.userId },
    update: {},
  })
  return { named: true, reach: MAINTAINER_REACH, maintainer: viewOf(row) }
}

export const removeLibraryMaintainer = async (args: { userId?: unknown }, context: Ctx): Promise<{ removed: boolean }> => {
  await requireNaming(context)
  if (typeof args?.userId !== 'string') throw new HttpError(400, `Choose who to remove. ${NOTHING}`)
  const { count } = await prisma.libraryMaintainer.deleteMany({ where: { userId: args.userId } })
  if (count === 0) throw new HttpError(404, `That person isn't a Library maintainer. ${NOTHING}`)
  return { removed: true }
}
