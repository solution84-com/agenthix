/**
 * The Artefacts tool's reads: a place's `artefacts/`, listed and opened. The
 * Knowledge tool's are `../knowledge/people/`.
 *
 * Every query applies the one location access rule to the owner BEFORE it asks
 * the site — the person's own storage, or a project they are on — exactly as
 * `listLocationFiles` does, and for the same reason: the site holds no identity
 * store and cannot tell whether the check happened (ADR-0042). A site that
 * cannot be reached is the same 503 every storage read gives.
 */
import { HttpError } from 'wasp/server'
import { LocationFileError, type StorageOwnerType } from '@agenthix/core'
import { assertLocationAccess } from './locationAccess'
import { rethrowLocationFileErrorAsHttp } from './httpErrors'
import { classifyFileContent, FILE_CONTENT_MAX_BYTES, type FileContent } from './fileContentService'
import { listArtefactsOnSite, readArtefactOnSite } from './ownerFolderStore'

type Ctx = { user?: { id: string } }
type OwnerArgs = { ownerType: StorageOwnerType; ownerId: string }

async function entitledOwner(args: OwnerArgs, context: Ctx): Promise<OwnerArgs> {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const owner = { ownerType: args.ownerType, ownerId: args.ownerId }
  await assertLocationAccess(owner, context.user.id, 'read')
  return owner
}

/** A file the site refused as too large to show is a state of the file, not a failure. */
async function content(name: string, read: () => Promise<Buffer>): Promise<FileContent> {
  try {
    return classifyFileContent(name, await read())
  } catch (err) {
    if (err instanceof LocationFileError && err.code === 'too_large') return { kind: 'too-large', name }
    rethrowLocationFileErrorAsHttp(err)
  }
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

export const getArtefactContentQuery = async (args: OwnerArgs & { name: string }, context: Ctx): Promise<FileContent> => {
  const owner = await entitledOwner(args, context)
  return content(args.name, () => readArtefactOnSite(owner, args.name, FILE_CONTENT_MAX_BYTES))
}
