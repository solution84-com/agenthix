/**
 * An asset's page as Wasp operations (skills spec part 6; board U3): the page itself, one version's files, and what
 * changed. Reading is for the organisation's people; every change is made by the lifecycle's own operations.
 * Hosted in `pages/pages.wasp.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { personActor } from '../../policyActors'
import { isProjectMember } from '../../../projects/membership'
import { LifecycleError } from '../../lifecycle/errors'
import type { PersonActor } from '../../policy'
import { assetContent } from './assetContent'
import { newsDiff, versionDiff } from './assetDiff'
import { assetPageView } from './pageView'
import type { AssetContentView, AssetDiffView, AssetPageView, NewsDiffView } from './pageTypes'

type Ctx = { user?: { id: string } | null }

async function reader(context: Ctx): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  const actor = await personActor(context.user.id, prisma)
  if (actor.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  return actor
}

async function refusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof LifecycleError) throw new HttpError(err.status, err.message)
    throw err
  }
}

export const getAssetPage = async (args: { assetId: string }, context: Ctx): Promise<AssetPageView> => {
  const viewer = await reader(context)
  return refusals(() => assetPageView(prisma, viewer, args?.assetId, isProjectMember))
}

export const getAssetContent = async (args: { assetId: string; versionId?: string; path?: string }, context: Ctx): Promise<AssetContentView> => {
  await reader(context)
  return refusals(() => assetContent(prisma, args?.assetId, args?.versionId, args?.path))
}

export const getAssetDiff = async (args: { assetId: string; versionId: string }, context: Ctx): Promise<AssetDiffView> => {
  await reader(context)
  return refusals(() => versionDiff(prisma, args?.assetId, args?.versionId))
}

export const getAssetNews = async (args: { assetId: string }, context: Ctx): Promise<NewsDiffView | null> => {
  await reader(context)
  return refusals(() => newsDiff(prisma, args?.assetId))
}
