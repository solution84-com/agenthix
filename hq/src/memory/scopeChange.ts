/**
 * The person widens a memory, or narrows it back (ADR-0188; spec, The memory record): its two switches flip between
 * the agent that saved it and every agent, and between the place it was saved in and everywhere. Only the person
 * whose memory it is may, and only from their own screen; no agent and no tool changes a scope.
 *
 * A memory moved into a scope that already holds its key meets that one: when the two are alike it is the
 * near-duplicate rule (items.ts), and otherwise it takes the key with a number added. An archived memory holding the
 * key is no memory to meet: it keeps its place in the archive under a numbered key, and the moving one takes the key.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { MemoryItemKindValue, MemoryScopeChoice } from '../shared/memory/protocol'
import { MEMORY_MAX_TAGS, MEMORY_SCOPE_MAX_ITEMS, REMEMBER_DUPLICATE_SIMILARITY } from '../shared/memory/protocol'
import type { MemoryService, Place, ScopeChangeOutcome } from './contract'
import { duplicateAction, KEY_MAX_CHARS, scopeFullRefusal, type DuplicateAction } from './items'
import { cosine } from './ranking'
import { scopeColumns, type MemoryScope } from './scopes'
import { lockScope } from './scopeLock'

export interface SavedFacts {
  userId: string
  writtenByAgentId: string | null
  savedInPlaceType: 'user' | 'project' | null
  savedInPlaceId: string | null
}

export const SAVING_AGENT_GONE =
  'The agent that saved this memory has since been deleted, so it can only be kept for every agent.'

/** The scope the switches ask for, or why it cannot be had. */
export function scopeFor(row: SavedFacts, choice: MemoryScopeChoice): { scope: MemoryScope } | { refused: string } {
  let agent: string | null = null
  if (choice.agent === 'saved') {
    if (!row.writtenByAgentId) return { refused: SAVING_AGENT_GONE }
    agent = row.writtenByAgentId
  }
  let place: Place | null = null
  // A memory saved where the work had no place, or whose place has since gone, holds everywhere: that is its own place.
  if (choice.place === 'saved' && row.savedInPlaceType && row.savedInPlaceId) {
    place = { type: row.savedInPlaceType, id: row.savedInPlaceId }
  }
  return { scope: { person: row.userId, agent, place } }
}

type Comparable = { kind: MemoryItemKindValue; body: string; embedding: number[]; embeddingModel: string | null; archived?: boolean }

/** What a memory moving into a scope does with the one already holding its key there. */
export function clashAction(moving: Comparable, held: Comparable): DuplicateAction | { action: 'renumber' | 'renumber-archived' } {
  if (held.archived) return { action: 'renumber-archived' }
  const alike = !!moving.embeddingModel && moving.embeddingModel === held.embeddingModel &&
    cosine(moving.embedding, held.embedding) >= REMEMBER_DUPLICATE_SIMILARITY
  return alike ? duplicateAction(moving, held) : { action: 'renumber' }
}

/** The key with the smallest number added that no memory in the scope holds. */
export function freeKey(key: string, taken: ReadonlySet<string>): string {
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = `${key.slice(0, KEY_MAX_CHARS - suffix.length).replace(/-+$/g, '')}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Whether a scope is at its cap, counting a live memory about to leave it (`leaving`) as gone already. */
export async function scopeFull(tx: Prisma.TransactionClient, scopeKey: string, leaving: number): Promise<boolean> {
  const live = await tx.memoryItem.count({ where: { scopeKey, archived: false } })
  return live - leaving >= MEMORY_SCOPE_MAX_ITEMS
}

/** The keys in a scope that a numbered form of `key` could clash with. */
export async function keysTaken(tx: Prisma.TransactionClient, scopeKey: string, key: string): Promise<Set<string>> {
  const taken = await tx.memoryItem.findMany({ where: { scopeKey, key: { startsWith: key.slice(0, KEY_MAX_CHARS - 4) } }, select: { key: true } })
  return new Set(taken.map(t => t.key))
}

const ROW_SELECT = {
  id: true, key: true, scopeKey: true, userId: true, kind: true, body: true, tags: true, embedding: true,
  embeddingModel: true, writtenByAgentId: true, savedInPlaceType: true, savedInPlaceId: true, archived: true,
} as const

export function createScopeChange(): Pick<MemoryService, 'setScope'> {
  async function setScope(personId: string, itemId: string, choice: MemoryScopeChoice): Promise<ScopeChangeOutcome> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.memoryItem.findFirst({ where: { id: itemId, userId: personId }, select: ROW_SELECT })
      if (!row) return { status: 'refused' as const, reason: 'That memory is already gone.' }
      const planned = scopeFor(row, choice)
      if ('refused' in planned) return { status: 'refused' as const, reason: planned.refused }
      const target = scopeColumns(planned.scope)
      if (target.scopeKey === row.scopeKey) return { status: 'unchanged' as const, itemId: row.id }

      await lockScope(tx, target.scopeKey)
      const held = await tx.memoryItem.findUnique({ where: { scopeKey_key: { scopeKey: target.scopeKey, key: row.key } }, select: ROW_SELECT })
      const decided = held ? clashAction(row, held) : null
      // A memory joined into one already there adds nothing; one that moves in counts against the cap, less the one it replaces.
      const joins = decided?.action === 'held' || decided?.action === 'merge'
      const leaving = decided?.action === 'supersede' && held && !held.archived ? 1 : 0
      if (!joins && !row.archived && await scopeFull(tx, target.scopeKey, leaving)) {
        return { status: 'refused' as const, reason: scopeFullRefusal(MEMORY_SCOPE_MAX_ITEMS) }
      }
      if (!held || !decided) {
        await tx.memoryItem.update({ where: { id: row.id }, data: target })
        return { status: 'changed' as const, itemId: row.id }
      }
      switch (decided.action) {
        case 'held':
          await tx.memoryItem.delete({ where: { id: row.id } })
          return { status: 'joined' as const, itemId: held.id }
        case 'merge': {
          const tags = [...new Set([...held.tags, ...row.tags])].slice(0, MEMORY_MAX_TAGS)
          // The background re-embed gives the joined memory its vector again.
          await tx.memoryItem.update({ where: { id: held.id }, data: { body: decided.body, tags, embedding: [], embeddingModel: null } })
          await tx.memoryItem.delete({ where: { id: row.id } })
          return { status: 'joined' as const, itemId: held.id }
        }
        case 'supersede':
          await tx.memoryItem.delete({ where: { id: held.id } })
          await tx.memoryItem.update({ where: { id: row.id }, data: target })
          return { status: 'changed' as const, itemId: row.id }
        case 'renumber-archived':
          await tx.memoryItem.update({ where: { id: held.id }, data: { key: freeKey(held.key, await keysTaken(tx, target.scopeKey, held.key)) } })
          await tx.memoryItem.update({ where: { id: row.id }, data: target })
          return { status: 'changed' as const, itemId: row.id }
        case 'renumber':
          await tx.memoryItem.update({ where: { id: row.id }, data: { ...target, key: freeKey(row.key, await keysTaken(tx, target.scopeKey, row.key)) } })
          return { status: 'changed' as const, itemId: row.id }
      }
    })
  }
  return { setScope }
}
