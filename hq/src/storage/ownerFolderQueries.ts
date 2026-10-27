/**
 * The Artefacts tool's reads: a place's `artefacts/`, listed. One opens through
 * hq's *open* action (`../files/`), and its bytes come through a relay. The
 * Knowledge tool's are `../knowledge/people/`.
 *
 * Every query applies the one location access rule to the owner BEFORE it asks
 * the site — the person's own storage, or a project they are on — exactly as
 * `listLocationFiles` does, and for the same reason: the site holds no identity
 * store and cannot tell whether the check happened (ADR-0042). A site that
 * cannot be reached is the same 503 every storage read gives.
 */
import { HttpError } from 'wasp/server'
import type { StorageOwnerType } from '@agenthix/core'
import { assertLocationAccess } from './locationAccess'
import { rethrowLocationFileErrorAsHttp } from './httpErrors'
import { listArtefactsOnSite } from './ownerFolderStore'

type Ctx = { user?: { id: string } }
type OwnerArgs = { ownerType: StorageOwnerType; ownerId: string }

async function entitledOwner(args: OwnerArgs, context: Ctx): Promise<OwnerArgs> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const owner = { ownerType: args.ownerType, ownerId: args.ownerId }
  await assertLocationAccess(owner, context.user.id, 'read')
  return owner
}

export const listArtefactsQuery = async (
  args: OwnerArgs,
  context: Ctx,
): Promise<{ entries: { name: string; size: number; modifiedAt: string }[] }> => {
  const owner = await entitledOwner(args, context)
  try {
    const { entries } = await listArtefactsOnSite(owner)
    return { entries: entries.map(entry => ({ name: entry.path, size: entry.size, modifiedAt: entry.modifiedAt })) }
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}
