import type { GetMyStorageSite } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { siteAsShown } from '../shared/siteName'

/** `label` as shown: HQ's own site is "hq-box · HQ's site". */
export type StorageSite = { id: string; label: string }

/**
 * The site that holds the caller's own storage, for Chat's Site fact (every
 * screen reviewed spec §7). Storage is placed on a site the first time it is
 * used and never moves; until then there is none, and this only reads — it
 * never places it.
 */
export const getMyStorageSite: GetMyStorageSite<void, StorageSite | null> = async (_args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const placement = await prisma.userStoragePlacement.findUnique({
    where: { userId: context.user.id },
    select: { site: { select: { id: true, label: true, isDefault: true } } },
  })
  return siteAsShown(placement?.site ?? null)
}
