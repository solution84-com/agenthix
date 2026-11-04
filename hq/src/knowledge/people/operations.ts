/**
 * The Wasp operations of the Knowledge tool, History and Recently deleted, at every level (declared in
 * `storage/storage.wasp.ts`). Each checks who is asking, parses its arguments, and answers a refusal as the HTTP error
 * a screen shows; the rules are in the modules beside this one.
 */
import { HttpError } from 'wasp/server'
import { z } from 'zod'
import { KnowledgeRefusal, type PeopleKnowledgeDeps } from './deps'
import { peopleKnowledgeDeps } from './index'
import { deletePage, movePage, restoreVersion, savePage } from './changes'
import { listPages, pageVersions, readPage, recentlyDeleted } from './reads'
import { searchPages } from './search'
import type {
  KnowledgeChangeAnswer, KnowledgeOwner, KnowledgePagesList, KnowledgePageView, KnowledgeSearchAnswer, KnowledgeVersionRow,
  RecentlyDeletedPage,
} from './types'

type Ctx = { user?: { id: string } }

const ownerSchema = z.discriminatedUnion('ownerType', [
  z.object({ ownerType: z.literal('project'), ownerId: z.string().min(1).max(100) }),
  z.object({ ownerType: z.literal('user'), ownerId: z.string().min(1).max(100) }),
  z.object({ ownerType: z.literal('org'), ownerId: z.string().max(100).optional() }),
])
const page = z.string().min(1).max(600)
const versionId = z.string().min(1).max(100)
/** Over a page's 64 KB the gate refuses with the problem on its field; this only bounds what is carried to it. */
const content = z.string().max(1024 * 1024)

const schemas = {
  list: z.object({ owner: ownerSchema }),
  get: z.object({ owner: ownerSchema, page, versionId: versionId.nullish() }),
  versions: z.object({ owner: ownerSchema, page }),
  deleted: z.object({ owner: ownerSchema }),
  search: z.object({ owner: ownerSchema, pattern: z.string().max(1000), scope: z.enum(['this', 'org', 'both']).optional() }),
  save: z.object({ owner: ownerSchema, page, content, baseVersion: z.string().min(1).max(100).nullable() }),
  move: z.object({ owner: ownerSchema, from: page, to: page, baseVersion: z.string().min(1).max(100) }),
  delete: z.object({ owner: ownerSchema, page, permanently: z.boolean().optional(), versionId: versionId.optional() }),
  restore: z.object({ owner: ownerSchema, page, versionId }),
}

/** `args` is typed as the screen sends it, so Wasp gives the client that type; it is still parsed, as anything sent is. */
function operation<S extends z.ZodType, R>(schema: S, run: (deps: PeopleKnowledgeDeps, args: z.infer<S>, userId: string) => Promise<R>) {
  return async (raw: z.input<S>, context: Ctx): Promise<R> => {
    if (!context.user) throw new HttpError(401, 'Not authenticated')
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new HttpError(400, 'That request is not one the Knowledge tool makes. Reload the page and try again.')
    try {
      return await run(peopleKnowledgeDeps, parsed.data, context.user.id)
    } catch (err) {
      if (err instanceof KnowledgeRefusal) throw new HttpError(err.status, err.message)
      throw err
    }
  }
}

const ownerOf = (o: z.infer<typeof ownerSchema>): KnowledgeOwner => o

export const listKnowledgePagesQuery = operation(schemas.list, (deps, a, userId): Promise<KnowledgePagesList> =>
  listPages(deps, ownerOf(a.owner), userId))

export const getKnowledgePageQuery = operation(schemas.get, (deps, a, userId): Promise<KnowledgePageView> =>
  readPage(deps, ownerOf(a.owner), { page: a.page, versionId: a.versionId ?? undefined }, userId))

export const knowledgePageVersionsQuery = operation(schemas.versions, (deps, a, userId): Promise<{ versions: KnowledgeVersionRow[]; truncated: boolean }> =>
  pageVersions(deps, ownerOf(a.owner), { page: a.page }, userId))

export const recentlyDeletedKnowledgeQuery = operation(schemas.deleted, (deps, a, userId): Promise<{ pages: RecentlyDeletedPage[]; canChange: boolean; truncated: boolean }> =>
  recentlyDeleted(deps, ownerOf(a.owner), userId))

export const searchKnowledgePagesQuery = operation(schemas.search, (deps, a, userId): Promise<KnowledgeSearchAnswer> =>
  searchPages(deps, ownerOf(a.owner), { pattern: a.pattern, ...(a.scope ? { scope: a.scope } : {}) }, userId))

export const saveKnowledgePageAction = operation(schemas.save, (deps, a, userId): Promise<KnowledgeChangeAnswer> =>
  savePage(deps, ownerOf(a.owner), { page: a.page, content: a.content, baseVersion: a.baseVersion }, userId))

export const moveKnowledgePageAction = operation(schemas.move, (deps, a, userId): Promise<KnowledgeChangeAnswer> =>
  movePage(deps, ownerOf(a.owner), { from: a.from, to: a.to, baseVersion: a.baseVersion }, userId))

export const deleteKnowledgePageAction = operation(schemas.delete, (deps, a, userId): Promise<KnowledgeChangeAnswer> =>
  deletePage(deps, ownerOf(a.owner), { page: a.page, ...(a.permanently ? { permanently: true } : {}), ...(a.versionId ? { versionId: a.versionId } : {}) }, userId))

export const restoreKnowledgeVersionAction = operation(schemas.restore, (deps, a, userId): Promise<KnowledgeChangeAnswer> =>
  restoreVersion(deps, ownerOf(a.owner), { page: a.page, versionId: a.versionId }, userId))
