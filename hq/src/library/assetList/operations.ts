/**
 * The Library's view as Wasp operations (skills spec part 6 *The Library*; adr-0172 for the Marketplace's flag).
 * Hosted in `library.wasp.ts`. Reading is for the organisation's people.
 */
import { HttpError, prisma } from 'wasp/server'
import { isOrgFeatureOn } from '../../features/switches'
import { requireFeature } from '../../features/requireFeature'
import { may } from '../../assets/policy'
import { organisationTarget, personActor } from '../../assets/policyActors'
import { libraryEntries } from './entries'
import type { LibraryAssets } from './types'

type Ctx = { user?: { id: string } | null }

export const getLibraryAssets = async (_args: unknown, context: Ctx): Promise<LibraryAssets> => {
  if (!context.user) throw new HttpError(401)
  const viewer = await personActor(context.user.id, prisma)
  if (viewer.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  const target = await organisationTarget(prisma)
  return {
    rows: await libraryEntries(prisma, viewer),
    isAdmin: viewer.role === 'ADMIN',
    mayAdd: may(viewer, 'install', target) || may(viewer, 'installFromOutside', target),
    marketplace: await isOrgFeatureOn('marketplace'),
  }
}

/** The Marketplace page's one read: refused where the flag is off, so the route is closed, not only hidden. */
export const getMarketplace = async (_args: unknown, context: Ctx): Promise<{ available: false }> => {
  if (!context.user) throw new HttpError(401)
  await requireFeature('marketplace')
  return { available: false }
}
