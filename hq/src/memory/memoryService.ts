/**
 * Memory recalled by meaning (memory and knowledge spec; ADR-0188): the one store every reader and writer goes
 * through — the lead in process, a worker through the data path, a person on the memory screen.
 *
 * Every call is made for a principal. An agent saves for the person, itself and the place it works in, and reads
 * what that scope check lets it recall (scopes.ts); nothing is read out of the arguments about who is asking or
 * where a memory holds. Only the person widens a memory or forgets it on the screen (scopeChange.ts). Recall is an
 * exact search in hq over the vectors that passed the scope check, which at memory scale takes milliseconds; it is
 * this one module, so an index can replace it when an organisation outgrows it.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  MEMORY_MAX_TAGS, MEMORY_SCOPE_MAX_ITEMS, RECALL_TOKEN_BUDGET, RECALL_TOP_K, REMEMBER_DUPLICATE_SIMILARITY,
} from '../shared/memory/protocol'
import type { Embedder, MemoryPrincipal, MemoryService, RecallOptions, RememberInput, RememberOutcome } from './contract'
import { NO_PERSON_REFUSAL, recallableWhere, savingScope, scopeColumns, specificity, type ScopeColumns } from './scopes'
import { cleanItem, duplicateAction, embeddingText, itemRefusal, keyFrom, nearDuplicatePlan, scopeFullRefusal } from './items'
import { cosine, itemTokens, rank } from './ranking'
import {
  ITEM_SELECT, embedOrNull, markRecalled, recalledItem, type ItemRow,
} from './memoryRows'
import { embedderFor as defaultEmbedderFor } from './embedding/embedders'
import { LOCAL_MODEL } from './embedding/localEmbedder'
import { lockScope } from './scopeLock'
import { createScopeChange, freeKey, keysTaken, scopeFull } from './scopeChange'

/** A call this store will not make, with a reason meant for whoever asked. */
export class MemoryRefused extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'MemoryRefused'
  }
}

export interface MemoryServiceDeps {
  embedderFor?: (model: string) => Embedder
  now?: () => Date
}

export function createMemoryService(deps: MemoryServiceDeps = {}): MemoryService {
  const embedderFor = deps.embedderFor ?? defaultEmbedderFor
  const now = deps.now ?? (() => new Date())

  async function remember(principal: MemoryPrincipal, input: RememberInput): Promise<RememberOutcome> {
    const scope = savingScope(principal)
    const reach = recallableWhere(principal)
    if (!scope || !reach) return { status: 'refused', reason: NO_PERSON_REFUSAL }
    const target = scopeColumns(scope)
    const item = cleanItem(input)
    const refusal = itemRefusal(item)
    if (refusal) return { status: 'refused', reason: refusal }
    const key = keyFrom(input.key?.trim() ? input.key : item.title)

    const model = LOCAL_MODEL
    const vector = (await embedOrNull(embedderFor(model), [embeddingText(item)]))?.[0] ?? null
    const saved = {
      writtenByAgentId: principal.agentId || null,
      savedInPlaceType: principal.place?.type ?? null,
      savedInPlaceId: principal.place?.id ?? null,
      savedInConversationId: input.conversationId ?? null,
    }
    const fields = {
      title: item.title, body: item.body, kind: input.kind, tags: item.tags,
      embedding: vector ?? [], embeddingModel: vector ? model : null,
    }

    let mergedInto: { id: string; title: string; body: string; tags: string[] } | null = null
    let outcome: RememberOutcome
    try {
      outcome = await prisma.$transaction(async (tx) => {
        await lockScope(tx, target.scopeKey)
        const sameKey = await tx.memoryItem.findUnique({ where: { scopeKey_key: { scopeKey: target.scopeKey, key } }, select: { id: true } })
        if (sameKey) {
          await tx.memoryItem.update({ where: { id: sameKey.id }, data: { ...fields, ...saved, archived: false } })
          return { status: 'replaced' as const, key, itemId: sameKey.id }
        }

        // Near-duplicates are looked for in everything this work could recall, so a memory the person promoted is
        // found rather than repeated unseen; what is done with one in a wider scope is nearDuplicatePlan's.
        const nearest = vector ? await nearestRecallable(tx, reach, model, vector) : null
        if (nearest && nearest.similarity >= REMEMBER_DUPLICATE_SIMILARITY) {
          const decided = duplicateAction({ kind: input.kind, body: item.body }, { kind: nearest.row.kind, body: nearest.row.body })
          const plan = nearDuplicatePlan(decided, { wider: nearest.row.scopeKey !== target.scopeKey, kind: input.kind, requested: input.requested === true })
          if (plan.plan === 'held') {
            return { status: 'merged' as const, key: nearest.row.key, itemId: nearest.row.id, alreadyHeld: { title: nearest.row.title } }
          }
          if (plan.plan === 'merge') {
            const tags = [...new Set([...nearest.row.tags, ...item.tags])].slice(0, MEMORY_MAX_TAGS)
            // Its vector is made again after the transaction; until then it is found by key.
            await tx.memoryItem.update({
              where: { id: nearest.row.id },
              data: { body: plan.body, tags, embedding: [], embeddingModel: null },
            })
            mergedInto = { id: nearest.row.id, title: nearest.row.title, body: plan.body, tags }
            return { status: 'merged' as const, key: nearest.row.key, itemId: nearest.row.id }
          }
          if (plan.plan === 'supersede') {
            // The replacement holds where the old one did: the saving scope, or the reach the person chose for it.
            const into = scopeColumnsOf(nearest.row)
            if (into.scopeKey !== target.scopeKey) await lockScope(tx, into.scopeKey)
            if (await scopeFull(tx, into.scopeKey, 1)) return { status: 'refused' as const, reason: scopeFullRefusal(MEMORY_SCOPE_MAX_ITEMS) }
            await tx.memoryItem.update({ where: { id: nearest.row.id }, data: { archived: true } })
            const freeHere = into.scopeKey === target.scopeKey ? key : await keyFreeIn(tx, into.scopeKey, key)
            const created = await tx.memoryItem.create({
              data: { ...into, key: freeHere, ...fields, ...saved },
            })
            return { status: 'superseded' as const, key: freeHere, itemId: created.id }
          }
        }

        if (await scopeFull(tx, target.scopeKey, 0)) return { status: 'refused' as const, reason: scopeFullRefusal(MEMORY_SCOPE_MAX_ITEMS) }
        const created = await tx.memoryItem.create({ data: { ...target, key, ...fields, ...saved } })
        return { status: 'added' as const, key, itemId: created.id }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { status: 'refused', reason: 'Another item was written under this key at the same moment. Try again.' }
      }
      throw error
    }

    if (mergedInto) await reembedMerged(mergedInto, model)
    return outcome
  }

  async function reembedMerged(item: { id: string; title: string; body: string; tags: string[] }, model: string): Promise<void> {
    const vector = (await embedOrNull(embedderFor(model), [embeddingText(item)]))?.[0]
    if (!vector) return
    await prisma.memoryItem.updateMany({ where: { id: item.id, body: item.body }, data: { embedding: vector, embeddingModel: model } })
  }

  async function forget(principal: MemoryPrincipal, key: string): Promise<boolean> {
    const reach = recallableWhere(principal)
    if (!reach) throw new MemoryRefused(NO_PERSON_REFUSAL)
    const rows = await prisma.memoryItem.findMany({ where: { AND: [reach, { key }] }, select: { id: true, agentId: true, placeId: true } })
    if (rows.length === 0) return false
    const narrowest = rows.sort((a, b) => specificity(b) - specificity(a))[0]!
    const { count } = await prisma.memoryItem.deleteMany({ where: { id: narrowest.id } })
    return count > 0
  }

  async function recallByKey(principal: MemoryPrincipal, keys: string[]) {
    const reach = recallableWhere(principal)
    if (keys.length === 0 || !reach) return []
    const rows = await prisma.memoryItem.findMany({ where: { AND: [reach, { key: { in: keys } }] }, select: ITEM_SELECT })
    const ordered = keys.flatMap(k => rows.filter(r => r.key === k).sort((a, b) => specificity(b) - specificity(a)))
    await markRecalled(ordered.map(r => r.id), now())
    return ordered.map(row => recalledItem(row))
  }

  function filteredWhere(reach: Prisma.MemoryItemWhereInput, options: RecallOptions): Prisma.MemoryItemWhereInput {
    return {
      AND: [
        reach,
        options.includeArchived ? {} : { archived: false },
        options.kind ? { kind: options.kind } : {},
        options.tags?.length ? { tags: { hasSome: options.tags.map(t => t.trim().toLowerCase()) } } : {},
      ],
    }
  }

  async function recallFiltered(principal: MemoryPrincipal, options: RecallOptions) {
    const reach = recallableWhere(principal)
    if (!reach) return { items: [], cut: [] }
    const k = options.k ?? RECALL_TOP_K
    const rows = await prisma.memoryItem.findMany({
      where: filteredWhere(reach, options), select: ITEM_SELECT, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: k + 1,
    })
    const items: ItemRow[] = []
    const cut: string[] = rows.slice(k).map(r => r.key)
    let spent = 0
    for (const row of rows.slice(0, k)) {
      const tokens = itemTokens(row)
      if (spent + tokens > (options.tokenBudget ?? RECALL_TOKEN_BUDGET)) { cut.push(row.key); continue }
      spent += tokens
      items.push(row)
    }
    await markRecalled(items.map(i => i.id), now())
    return { items: items.map(row => recalledItem(row)), cut }
  }

  async function recallByQuery(principal: MemoryPrincipal, query: string | number[], options: RecallOptions = {}) {
    const reach = recallableWhere(principal)
    if (!reach) return { items: [], cut: [] }
    const rows = await prisma.memoryItem.findMany({ where: filteredWhere(reach, options), select: ITEM_SELECT })
    const queryVectors = await queryVectorsFor(query, rows)
    const candidates = rows.flatMap(row => {
      const q = row.embeddingModel ? queryVectors.get(row.embeddingModel) : undefined
      return q ? [{ ...row, row, similarity: cosine(q, row.embedding) }] : []
    })
    const at = now()
    const { items, cut } = rank(candidates, { k: options.k ?? RECALL_TOP_K, tokenBudget: options.tokenBudget ?? RECALL_TOKEN_BUDGET, now: at })
    await markRecalled(items.map(i => i.id), at)
    return { items: items.map(i => recalledItem(i.row, { similarity: i.similarity, score: i.score })), cut }
  }

  /** The query's vector in the built-in model, which is the one the rows are searched in. A vector given by the caller is in it. */
  async function queryVectorsFor(query: string | number[], rows: ItemRow[]): Promise<Map<string, number[]>> {
    if (typeof query !== 'string') return new Map([[LOCAL_MODEL, query]])
    const vectors = new Map<string, number[]>()
    if (!rows.some(r => r.embeddingModel === LOCAL_MODEL)) return vectors
    const vector = (await embedOrNull(embedderFor(LOCAL_MODEL), [query]))?.[0]
    if (vector) vectors.set(LOCAL_MODEL, vector)
    return vectors
  }

  async function recordOutcomes(outcomes: Parameters<MemoryService['recordOutcomes']>[0]): Promise<void> {
    if (outcomes.length === 0) return
    const used = new Map<string, number>()
    for (const o of outcomes) if (o.kind === 'USED') used.set(o.itemId, (used.get(o.itemId) ?? 0) + 1)
    await prisma.$transaction([
      prisma.memoryOutcome.createMany({
        data: outcomes.map(o => ({
          itemId: o.itemId, kind: o.kind, similarity: o.similarity ?? null, weighted: o.weighted ?? false,
          turnId: o.turnId ?? null,
        })),
      }),
      ...[...used].map(([id, n]) => prisma.memoryItem.updateMany({ where: { id }, data: { usedCount: { increment: n } } })),
    ])
  }

  async function forgetOwn(personId: string, itemId: string): Promise<boolean> {
    const { count } = await prisma.memoryItem.deleteMany({ where: { id: itemId, userId: personId } })
    return count > 0
  }

  const { setScope } = createScopeChange()
  return { remember, forget, recallByKey, recallByQuery, recallFiltered, recordOutcomes, setScope, forgetOwn }
}

/** The memory nearest to a vector made with `model`, among those not archived that the principal could recall. */
async function nearestRecallable(tx: Prisma.TransactionClient, reach: Prisma.MemoryItemWhereInput, model: string, vector: number[]) {
  const rows = await tx.memoryItem.findMany({
    where: { AND: [reach, { archived: false, embeddingModel: model }] },
    select: {
      id: true, key: true, kind: true, title: true, body: true, tags: true, embedding: true,
      scopeKey: true, userId: true, agentId: true, placeType: true, placeId: true,
    },
  })
  let best: { row: (typeof rows)[number]; similarity: number } | null = null
  for (const row of rows) {
    const similarity = cosine(vector, row.embedding)
    if (!best || similarity > best.similarity) best = { row, similarity }
  }
  return best
}

/** A stored row's scope columns, as a new memory in the same scope takes them. */
function scopeColumnsOf(row: ScopeColumns): ScopeColumns {
  return { scopeKey: row.scopeKey, userId: row.userId, agentId: row.agentId, placeType: row.placeType, placeId: row.placeId }
}

/** The key, or it with the smallest number added, that no memory in the scope holds. */
async function keyFreeIn(tx: Prisma.TransactionClient, scopeKey: string, key: string): Promise<string> {
  const taken = await keysTaken(tx, scopeKey, key)
  return taken.has(key) ? freeKey(key, taken) : key
}

/** The store hq runs with. */
export const memoryService: MemoryService = createMemoryService()
