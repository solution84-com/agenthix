/**
 * Memory recalled by meaning (memory and knowledge spec): the one store every reader and writer goes through —
 * the lead in process, a worker through the data path, a person on the memory screen.
 *
 * Every call is made for a principal and reaches only the scopes that principal may (scopes.ts); nothing is read
 * out of the arguments about who is asking. Recall is an exact search in hq over the vectors of the scopes the
 * principal reaches, which at memory scale takes milliseconds; it is this one module, so an index can replace it
 * when an organisation outgrows it.
 */
import { prisma } from 'wasp/server'
import { Prisma } from '@prisma/client'
import {
  MEMORY_MAX_TAGS, MEMORY_SCOPE_MAX_ITEMS, RECALL_TOKEN_BUDGET, RECALL_TOP_K, REMEMBER_DUPLICATE_SIMILARITY,
} from '../shared/memory/protocol'
import type { Embedder, MemoryPrincipal, MemoryService, RememberInput, RememberOutcome } from './contract'
import { reachableTargets, scopeRefusal, scopeTarget, type ScopeTarget } from './scopes'
import { cleanItem, duplicateAction, embeddingText, itemRefusal, keyFrom } from './items'
import { cosine, rank } from './ranking'
import {
  ITEM_SELECT, embedOrNull, embeddingState, markRecalled, recalledItem, writingModel, type ItemRow,
} from './memoryRows'
import { embedderFor as defaultEmbedderFor } from './embedding/embedders'

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

const scopeFull = (): string =>
  `This memory already holds ${MEMORY_SCOPE_MAX_ITEMS} items. Forget something no longer true before remembering more.`

/** Taken first in every writing transaction, so the duplicate check, the count and the write see one scope at rest. */
async function lockScope(tx: Prisma.TransactionClient, scopeKey: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`memory:${scopeKey}`}, 0))`
}

function writer(input: RememberInput): { writtenByAgentId: string | null; writtenByUserId: string | null } {
  return 'agentId' in input.writtenBy
    ? { writtenByAgentId: input.writtenBy.agentId, writtenByUserId: null }
    : { writtenByAgentId: null, writtenByUserId: input.writtenBy.userId }
}

export function createMemoryService(deps: MemoryServiceDeps = {}): MemoryService {
  const embedderFor = deps.embedderFor ?? defaultEmbedderFor
  const now = deps.now ?? (() => new Date())

  function reachable(principal: MemoryPrincipal, scopes?: RememberInput['scope'][]): ScopeTarget[] {
    return reachableTargets(principal, scopes)
  }

  async function remember(principal: MemoryPrincipal, input: RememberInput): Promise<RememberOutcome> {
    const target = scopeTarget(principal, input.scope)
    if (!target) return { status: 'refused', reason: scopeRefusal(principal, input.scope) }
    const item = cleanItem(input)
    const refusal = itemRefusal(item)
    if (refusal) return { status: 'refused', reason: refusal }
    const key = keyFrom(input.key?.trim() ? input.key : item.title)

    const model = writingModel(await embeddingState())
    const vector = (await embedOrNull(embedderFor(model), [embeddingText(item)]))?.[0] ?? null
    const fields = {
      title: item.title, body: item.body, kind: input.kind, tags: item.tags,
      embedding: vector ?? [], embeddingModel: vector ? model : null, ...writer(input),
    }

    let mergedInto: { id: string; title: string; body: string; tags: string[] } | null = null
    let outcome: RememberOutcome
    try {
      outcome = await prisma.$transaction(async (tx) => {
        await lockScope(tx, target.scopeKey)
        const sameKey = await tx.memoryItem.findUnique({ where: { scopeKey_key: { scopeKey: target.scopeKey, key } }, select: { id: true } })
        if (sameKey) {
          await tx.memoryItem.update({
            where: { id: sameKey.id },
            data: { ...fields, archived: false, ...(input.pinned !== undefined ? { pinned: input.pinned } : {}) },
          })
          return { status: 'replaced' as const, key, itemId: sameKey.id }
        }

        const nearest = vector ? await nearestInScope(tx, target.scopeKey, model, vector) : null
        if (nearest && nearest.similarity >= REMEMBER_DUPLICATE_SIMILARITY) {
          const decided = duplicateAction({ kind: input.kind, body: item.body }, { kind: nearest.row.kind, body: nearest.row.body })
          if (decided.action === 'held') return { status: 'merged' as const, key: nearest.row.key, itemId: nearest.row.id }
          if (decided.action === 'merge') {
            const tags = [...new Set([...nearest.row.tags, ...item.tags])].slice(0, MEMORY_MAX_TAGS)
            // Its vector is made again after the transaction; until then it is found by key.
            await tx.memoryItem.update({
              where: { id: nearest.row.id },
              data: { body: decided.body, tags, embedding: [], embeddingModel: null, ...writer(input) },
            })
            mergedInto = { id: nearest.row.id, title: nearest.row.title, body: decided.body, tags }
            return { status: 'merged' as const, key: nearest.row.key, itemId: nearest.row.id }
          }
          await tx.memoryItem.update({ where: { id: nearest.row.id }, data: { archived: true } })
          const created = await tx.memoryItem.create({
            data: { ...target, key, ...fields, pinned: input.pinned ?? nearest.row.pinned, supersedesId: nearest.row.id },
          })
          return { status: 'superseded' as const, key, itemId: created.id }
        }

        const held = await tx.memoryItem.count({ where: { scopeKey: target.scopeKey, archived: false } })
        if (held >= MEMORY_SCOPE_MAX_ITEMS) return { status: 'refused' as const, reason: scopeFull() }
        const created = await tx.memoryItem.create({ data: { ...target, key, ...fields, pinned: input.pinned ?? false } })
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

  async function forget(principal: MemoryPrincipal, key: string, scope: RememberInput['scope']): Promise<boolean> {
    const target = scopeTarget(principal, scope)
    if (!target) throw new MemoryRefused(scopeRefusal(principal, scope))
    const { count } = await prisma.memoryItem.deleteMany({ where: { scopeKey: target.scopeKey, key } })
    return count > 0
  }

  async function recallByKey(principal: MemoryPrincipal, keys: string[]) {
    const scopeKeys = reachable(principal).map(t => t.scopeKey)
    if (keys.length === 0 || scopeKeys.length === 0) return []
    const rows = await prisma.memoryItem.findMany({ where: { scopeKey: { in: scopeKeys }, key: { in: keys } }, select: ITEM_SELECT })
    const ordered = keys.flatMap(k => rows.filter(r => r.key === k))
    await markRecalled(ordered.map(r => r.id), now())
    return ordered.map(row => recalledItem(row))
  }

  async function recallByQuery(principal: MemoryPrincipal, query: string | number[], options: Parameters<MemoryService['recallByQuery']>[2] = {}) {
    const scopeKeys = reachable(principal, options.scopes).map(t => t.scopeKey)
    if (scopeKeys.length === 0) return { items: [], cut: [] }
    const rows = await prisma.memoryItem.findMany({
      where: { scopeKey: { in: scopeKeys }, ...(options.includeArchived ? {} : { archived: false }) },
      select: ITEM_SELECT,
    })
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

  /**
   * The query's vector in each model the rows were embedded with: while a switch re-embeds, both the current and
   * the next, so every item stays searchable. A vector given by the caller is in the current model.
   */
  async function queryVectorsFor(query: string | number[], rows: ItemRow[]): Promise<Map<string, number[]>> {
    const state = await embeddingState()
    if (typeof query !== 'string') return new Map([[state.current, query]])
    const models = [state.current, state.next].filter((m): m is string => !!m && rows.some(r => r.embeddingModel === m))
    const vectors = new Map<string, number[]>()
    for (const model of models) {
      const vector = (await embedOrNull(embedderFor(model), [query]))?.[0]
      if (vector) vectors.set(model, vector)
    }
    return vectors
  }

  async function pinned(principal: MemoryPrincipal) {
    const scopeKeys = reachable(principal).map(t => t.scopeKey)
    if (scopeKeys.length === 0) return []
    const rows = await prisma.memoryItem.findMany({
      where: { scopeKey: { in: scopeKeys }, pinned: true, archived: false },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: ITEM_SELECT,
    })
    return rows.map(row => recalledItem(row))
  }

  async function recordOutcomes(outcomes: Parameters<MemoryService['recordOutcomes']>[0]): Promise<void> {
    if (outcomes.length === 0) return
    const used = new Map<string, number>()
    for (const o of outcomes) if (o.kind === 'USED') used.set(o.itemId, (used.get(o.itemId) ?? 0) + 1)
    await prisma.$transaction([
      prisma.memoryOutcome.createMany({
        data: outcomes.map(o => ({
          itemId: o.itemId, kind: o.kind, similarity: o.similarity ?? null,
          conversationId: o.conversationId ?? null, turnId: o.turnId ?? null, runId: o.runId ?? null,
        })),
      }),
      ...[...used].map(([id, n]) => prisma.memoryItem.updateMany({ where: { id }, data: { usedCount: { increment: n } } })),
    ])
  }

  return { remember, forget, recallByKey, recallByQuery, pinned, recordOutcomes }
}

/** The item in the scope nearest to a vector made with `model`, among those not archived. */
async function nearestInScope(tx: Prisma.TransactionClient, scopeKey: string, model: string, vector: number[]) {
  const rows = await tx.memoryItem.findMany({
    where: { scopeKey, archived: false, embeddingModel: model },
    select: { id: true, key: true, kind: true, title: true, body: true, tags: true, pinned: true, embedding: true },
  })
  let best: { row: (typeof rows)[number]; similarity: number } | null = null
  for (const row of rows) {
    const similarity = cosine(vector, row.embedding)
    if (!best || similarity > best.similarity) best = { row, similarity }
  }
  return best
}

/** The store hq runs with. */
export const memoryService: MemoryService = createMemoryService()
