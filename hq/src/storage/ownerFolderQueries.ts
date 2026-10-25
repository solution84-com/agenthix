/**
 * The Artefacts and Knowledge tools' reads: a place's `artefacts/` and
 * `knowledge/`, listed and opened.
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
import { listArtefactsOnSite, listKnowledgeOnSite, readArtefactOnSite, readKnowledgeOnSite } from './ownerFolderStore'

type Ctx = { user?: { id: string } }
type OwnerArgs = { ownerType: StorageOwnerType; ownerId: string }

/** A type alias, not an interface: a query's result must be a plain JSON object to Wasp. */
export type KnowledgeTopic = {
  path: string
  title: string
  summary: string
  tags: string[]
  modifiedAt: string
}

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

/**
 * The pages of the owner's knowledge, newest first, as the site's itemiser lists them: the title, description and
 * tags from each page's front matter.
 */
export const listKnowledgeQuery = async (args: OwnerArgs, context: Ctx): Promise<{ topics: KnowledgeTopic[] }> => {
  const owner = await entitledOwner(args, context)
  try {
    const { pages = [] } = await listKnowledgeOnSite(owner)
    const topics = pages
      .map(page => ({ path: page.page, title: page.title, summary: page.description, tags: page.tags, modifiedAt: page.modifiedAt }))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.path.localeCompare(b.path))
    return { topics }
  } catch (err) {
    rethrowLocationFileErrorAsHttp(err)
  }
}

export const getKnowledgeContentQuery = async (args: OwnerArgs & { path: string }, context: Ctx): Promise<FileContent> => {
  const owner = await entitledOwner(args, context)
  const name = args.path.split('/').pop() || args.path
  return content(name, () => readKnowledgeOnSite(owner, args.path, FILE_CONTENT_MAX_BYTES))
}
