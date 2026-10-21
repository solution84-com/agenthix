/**
 * The tidy (memory and knowledge spec, Recall by meaning): merges items that say the same thing, archives items
 * nobody has recalled for MEMORY_COLD_AFTER_DAYS — kept, and recallable by a direct question, but not searched by
 * default — and removes the memory of a place that no longer exists. Pinned items are never archived as cold.
 */
import { prisma } from 'wasp/server'
import { MEMORY_COLD_AFTER_DAYS, MEMORY_MAX_TAGS, REMEMBER_DUPLICATE_SIMILARITY, type MemoryItemKindValue } from '../shared/memory/protocol'
import { cosine } from './ranking'
import { duplicateAction } from './items'

const DAY_MS = 24 * 60 * 60 * 1000

export interface TidyRow {
  id: string
  scopeKey: string
  kind: MemoryItemKindValue
  body: string
  tags: string[]
  pinned: boolean
  embedding: number[]
  embeddingModel: string | null
  updatedAt: Date
}

/** One change the tidy makes to a pair of near-duplicates. */
export type TidyChange =
  | { kind: 'archive'; id: string; supersededBy?: string; pinSurvivor?: string }
  | { kind: 'merge'; into: string; body: string; tags: string[]; archive: string; pin: boolean }

/** Pairs in one scope, older then newer, that are near-duplicates; each item takes part in one change at most. */
export function duplicateChanges(rows: readonly TidyRow[]): TidyChange[] {
  const byAge = [...rows].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
  const touched = new Set<string>()
  const changes: TidyChange[] = []
  for (let i = 0; i < byAge.length; i++) {
    const older = byAge[i]
    if (touched.has(older.id) || !older.embeddingModel) continue
    for (let j = i + 1; j < byAge.length; j++) {
      const newer = byAge[j]
      if (touched.has(newer.id) || newer.embeddingModel !== older.embeddingModel) continue
      if (cosine(older.embedding, newer.embedding) < REMEMBER_DUPLICATE_SIMILARITY) continue
      const decided = duplicateAction({ kind: newer.kind, body: newer.body }, { kind: older.kind, body: older.body })
      const eitherPinned = older.pinned || newer.pinned
      if (decided.action === 'held') {
        changes.push({ kind: 'archive', id: newer.id, ...(newer.pinned && !older.pinned ? { pinSurvivor: older.id } : {}) })
      } else if (decided.action === 'supersede') {
        changes.push({ kind: 'archive', id: older.id, supersededBy: newer.id, ...(older.pinned && !newer.pinned ? { pinSurvivor: newer.id } : {}) })
      } else {
        const tags = [...new Set([...older.tags, ...newer.tags])].slice(0, MEMORY_MAX_TAGS)
        changes.push({ kind: 'merge', into: older.id, body: decided.body, tags, archive: newer.id, pin: eitherPinned })
      }
      touched.add(older.id)
      touched.add(newer.id)
      break
    }
  }
  return changes
}

async function apply(change: TidyChange): Promise<void> {
  if (change.kind === 'archive') {
    await prisma.$transaction([
      prisma.memoryItem.updateMany({ where: { id: change.id }, data: { archived: true } }),
      ...(change.supersededBy ? [prisma.memoryItem.updateMany({ where: { id: change.supersededBy }, data: { supersedesId: change.id } })] : []),
      ...(change.pinSurvivor ? [prisma.memoryItem.updateMany({ where: { id: change.pinSurvivor }, data: { pinned: true } })] : []),
    ])
    return
  }
  // The merged item's vector is made again by the background re-embed.
  await prisma.$transaction([
    prisma.memoryItem.updateMany({
      where: { id: change.into },
      data: { body: change.body, tags: change.tags, pinned: change.pin, embedding: [], embeddingModel: null },
    }),
    prisma.memoryItem.updateMany({ where: { id: change.archive }, data: { archived: true } }),
  ])
}

export async function tidyMemory(now: Date = new Date()): Promise<{ merged: number; archived: number; removed: number }> {
  const removed = await removeOrphanedPlaces()

  const rows: TidyRow[] = (await prisma.memoryItem.findMany({
    where: { archived: false },
    select: { id: true, scopeKey: true, kind: true, body: true, tags: true, pinned: true, embedding: true, embeddingModel: true, updatedAt: true },
  })) as TidyRow[]
  const byScope = new Map<string, TidyRow[]>()
  for (const row of rows) byScope.set(row.scopeKey, [...(byScope.get(row.scopeKey) ?? []), row])
  let merged = 0
  for (const scopeRows of byScope.values()) {
    for (const change of duplicateChanges(scopeRows)) {
      await apply(change)
      merged++
    }
  }

  const cutoff = new Date(now.getTime() - MEMORY_COLD_AFTER_DAYS * DAY_MS)
  const { count: archived } = await prisma.memoryItem.updateMany({
    where: {
      archived: false,
      pinned: false,
      OR: [{ lastRecalledAt: { lt: cutoff } }, { lastRecalledAt: null, updatedAt: { lt: cutoff } }],
    },
    data: { archived: true },
  })
  return { merged, archived, removed }
}

/** A project's memory goes with the project; a person's own space's, with the person (their rows cascade). */
async function removeOrphanedPlaces(): Promise<number> {
  const places = await prisma.memoryItem.findMany({
    where: { scope: 'AGENT_PLACE' },
    distinct: ['placeType', 'placeId'],
    select: { placeType: true, placeId: true },
  })
  const projectIds = places.filter(p => p.placeType === 'project' && p.placeId).map(p => p.placeId as string)
  const userIds = places.filter(p => p.placeType === 'user' && p.placeId).map(p => p.placeId as string)
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
  ])
  const gone = [
    ...projectIds.filter(id => !projects.some(p => p.id === id)).map(id => ({ placeType: 'project' as const, placeId: id })),
    ...userIds.filter(id => !users.some(u => u.id === id)).map(id => ({ placeType: 'user' as const, placeId: id })),
  ]
  if (gone.length === 0) return 0
  const { count } = await prisma.memoryItem.deleteMany({ where: { scope: 'AGENT_PLACE', OR: gone } })
  return count
}
