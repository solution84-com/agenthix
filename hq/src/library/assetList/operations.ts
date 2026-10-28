/**
 * The Library's view as Wasp operations (skills spec part 6 *The Library*; adr-0116 for the Marketplace's flag).
 * Hosted in `library.wasp.ts`. Reading is for the organisation's people.
 */
import { HttpError, prisma } from 'wasp/server'
import { isFeatureOn } from '@agenthix/core'
import { may } from '../../assets/policy'
import { organisationTarget, personActor } from '../../assets/policyActors'
import { libraryRows } from './rows'
import type { LibraryAssets } from './types'

type Ctx = { user?: { id: string } | null }

export const getLibraryAssets = async (_args: unknown, context: Ctx): Promise<LibraryAssets> => {
  if (!context.user) throw new HttpError(401)
  const viewer = await personActor(context.user.id, prisma)
  if (viewer.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  const target = await organisationTarget(prisma)
  return {
    rows: await libraryRows(prisma, viewer),
    isAdmin: viewer.role === 'ADMIN',
    mayAdd: may(viewer, 'install', target) || may(viewer, 'installFromOutside', target),
    marketplace: isFeatureOn('marketplace', process.env),
  }
}

/** The Marketplace page's one read: refused where the flag is off, so the route is closed in production, not hidden. */
export const getMarketplace = async (_args: unknown, context: Ctx): Promise<{ available: false }> => {
  if (!context.user) throw new HttpError(401)
  if (!isFeatureOn('marketplace', process.env)) throw new HttpError(404, 'The Marketplace is not available. Nothing was changed.')
  return { available: false }
}
