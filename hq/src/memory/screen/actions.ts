import { HttpError, prisma } from 'wasp/server'
import type { ForgetMemoryItem, SaveMemoryItem, SetMemoryEmbeddingModel, SetMemoryPinned } from 'wasp/server/operations'
import {
  MEMORY_MAX_TAGS, type MemoryItemIdArgs, type MemoryItemView, type SaveMemoryItemArgs, type SetMemoryPinnedArgs,
} from '../../shared/memory/protocol'
import { isOrgAdmin } from '../../projects/membership'
import { memoryService, MemoryRefused } from '../memoryService'
import { switchEmbeddingModel } from '../reembed'
import { KINDS, screenPrincipal, screenTarget, signedIn, specOf, type ScopeSpec } from './access'
import { VIEW_SELECT, viewsOf } from './views'

/** The item, once the person is known to be allowed its scope; its key and scope are what the store acts by. */
async function ownItem(userId: string, id: string) {
  const item = await prisma.memoryItem.findUnique({ where: { id }, select: { ...VIEW_SELECT, scopeKey: true } })
  if (!item) throw new HttpError(404, 'That memory is already gone')
  const spec = specOf({ ...item, scope: item.scope, placeType: item.placeType })
  const { principal, target } = await screenTarget(userId, spec)
  // The spec is rebuilt from the item's columns but a person's scopes are keyed to the person: it must be theirs.
  if (target.scopeKey !== item.scopeKey) throw new HttpError(403, 'That memory is not yours to change')
  return { item, spec, principal }
}

export const saveMemoryItem: SaveMemoryItem<SaveMemoryItemArgs, MemoryItemView> = async (args, context) => {
  const userId = signedIn(context)
  if (!KINDS.includes(args.kind)) throw new HttpError(400, 'Unknown kind of memory')
  if ((args.tags?.length ?? 0) > MEMORY_MAX_TAGS) throw new HttpError(400, `At most ${MEMORY_MAX_TAGS} tags`)

  let spec: ScopeSpec = args
  let key: string | undefined
  if (args.id) {
    const own = await ownItem(userId, args.id)
    spec = own.spec
    key = own.item.key
  }
  const principal = await screenPrincipal(userId, spec)
  const outcome = await memoryService.remember(principal, {
    scope: spec.scope, title: args.title, body: args.body, kind: args.kind, tags: args.tags,
    ...(key ? { key } : {}), writtenBy: { userId },
  })
  if (outcome.status === 'refused') throw new HttpError(400, outcome.reason)
  const row = await prisma.memoryItem.findUniqueOrThrow({ where: { id: outcome.itemId }, select: VIEW_SELECT })
  return (await viewsOf([row]))[0]
}

export const setMemoryPinned: SetMemoryPinned<SetMemoryPinnedArgs, { ok: true }> = async (args, context) => {
  const userId = signedIn(context)
  const { item } = await ownItem(userId, args.id)
  await prisma.memoryItem.update({ where: { id: item.id }, data: { pinned: args.pinned } })
  return { ok: true }
}

/** Forgetting is deleting: the item is gone, not archived. */
export const forgetMemoryItem: ForgetMemoryItem<MemoryItemIdArgs, { ok: boolean }> = async (args, context) => {
  const userId = signedIn(context)
  const item = await prisma.memoryItem.findUnique({ where: { id: args.id }, select: VIEW_SELECT })
  if (!item) return { ok: false }
  const { principal, spec } = await ownItem(userId, args.id)
  return { ok: await memoryService.forget(principal, item.key, spec.scope) }
}

/** An organisation admin's: starts moving every item to another embedding model; the old vectors serve until done. */
export const setMemoryEmbeddingModel: SetMemoryEmbeddingModel<{ model: string }, { ok: true }> = async (args, context) => {
  const userId = signedIn(context)
  if (!(await isOrgAdmin(userId))) throw new HttpError(403, 'Only an organisation admin can change the embedding model')
  try {
    await switchEmbeddingModel(args.model.trim())
  } catch (error) {
    if (error instanceof MemoryRefused) throw new HttpError(400, error.reason)
    throw error
  }
  return { ok: true }
}
