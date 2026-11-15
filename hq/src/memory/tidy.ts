/**
 * The tidy (memory and knowledge spec, Recall by meaning): merges items that say the same thing, archives items
 * nobody has recalled for MEMORY_COLD_AFTER_DAYS — kept, and recallable by a direct question, but not searched by
 * default — and removes the memories scoped to a place that no longer exists, emptying the saved-in place of a
 * promoted one saved there (ADR-0188). Near-duplicates follow the rule by kind (items.ts).
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
  embedding: number[]
  embeddingModel: string | null
  updatedAt: Date
}

/** One change the tidy makes to a pair of near-duplicates. */
export type TidyChange =
  | { kind: 'archive'; id: string; supersededBy?: string }
  | { kind: 'merge'; into: string; body: string; tags: string[]; archive: string }

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
      if (decided.action === 'held') {
        changes.push({ kind: 'archive', id: newer.id })
      } else if (decided.action === 'supersede') {
        changes.push({ kind: 'archive', id: older.id, supersededBy: newer.id })
      } else {
        const tags = [...new Set([...older.tags, ...newer.tags])].slice(0, MEMORY_MAX_TAGS)
        changes.push({ kind: 'merge', into: older.id, body: decided.body, tags, archive: newer.id })
      }
      touched.add(older.id)
      touched.add(newer.id)
      break
    }
  }
  return changes
}

/**
 * Applies one change to the rows as they were read; false, with nothing changed, when any of them was written since,
 * so a person's edit made while the tidy runs is never overwritten. The next tidy looks at the item again.
 */
export async function applyChange(change: TidyChange, readAt: ReadonlyMap<string, Date>): Promise<boolean> {
  const unchanged = (id: string) => ({ id, updatedAt: readAt.get(id) })
  class Moved extends Error {}
  const guarded = async (count: Promise<{ count: number }>) => { if ((await count).count !== 1) throw new Moved() }
  try {
    await prisma.$transaction(async (tx) => {
      if (change.kind === 'archive') {
        await guarded(tx.memoryItem.updateMany({ where: unchanged(change.id), data: { archived: true } }))
        // The newer item it gave way to must still be as it was read.
        if (change.supersededBy && (await tx.memoryItem.count({ where: unchanged(change.supersededBy) })) !== 1) throw new Moved()
        return
      }
      // The merged item's vector is made again by the background re-embed.
      await guarded(tx.memoryItem.updateMany({
        where: unchanged(change.into),
        data: { body: change.body, tags: change.tags, embedding: [], embeddingModel: null },
      }))
      await guarded(tx.memoryItem.updateMany({ where: unchanged(change.archive), data: { archived: true } }))
    })
    return true
  } catch (error) {
    if (error instanceof Moved) return false
    throw error
  }
}

export async function tidyMemory(now: Date = new Date()): Promise<{ merged: number; archived: number; removed: number }> {
  const removed = await removeOrphanedPlaces()

  const rows: TidyRow[] = (await prisma.memoryItem.findMany({
    where: { archived: false },
    select: { id: true, scopeKey: true, kind: true, body: true, tags: true, embedding: true, embeddingModel: true, updatedAt: true },
  })) as TidyRow[]
  const byScope = new Map<string, TidyRow[]>()
  for (const row of rows) byScope.set(row.scopeKey, [...(byScope.get(row.scopeKey) ?? []), row])
  const readAt = new Map(rows.map(r => [r.id, r.updatedAt]))
  let merged = 0
  for (const scopeRows of byScope.values()) {
    for (const change of duplicateChanges(scopeRows)) {
      if (await applyChange(change, readAt)) merged++
    }
  }

  const cutoff = new Date(now.getTime() - MEMORY_COLD_AFTER_DAYS * DAY_MS)
  const { count: archived } = await prisma.memoryItem.updateMany({
    where: {
      archived: false,
      OR: [{ lastRecalledAt: { lt: cutoff } }, { lastRecalledAt: null, updatedAt: { lt: cutoff } }],
    },
    data: { archived: true },
  })
  return { merged, archived, removed }
}

type PlaceRef = { placeType: 'user' | 'project'; placeId: string }

/** Of these places, those that no longer exist. */
async function gonePlaces(places: { type: 'user' | 'project' | null; id: string | null }[]): Promise<PlaceRef[]> {
  const projectIds = [...new Set(places.filter(p => p.type === 'project' && p.id).map(p => p.id as string))]
  const userIds = [...new Set(places.filter(p => p.type === 'user' && p.id).map(p => p.id as string))]
  const [projects, users] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } }),
  ])
  return [
    ...projectIds.filter(id => !projects.some(p => p.id === id)).map(id => ({ placeType: 'project' as const, placeId: id })),
    ...userIds.filter(id => !users.some(u => u.id === id)).map(id => ({ placeType: 'user' as const, placeId: id })),
  ]
}

/**
 * A memory scoped to a place goes with the place (a person's own space's, with the person: their rows cascade). A
 * promoted memory that was only saved there stays, with its saved-in place emptied, so its switch cannot flip back.
 */
async function removeOrphanedPlaces(): Promise<number> {
  const scoped = await prisma.memoryItem.findMany({
    where: { placeId: { not: null } },
    distinct: ['placeType', 'placeId'],
    select: { placeType: true, placeId: true },
  })
  const gone = await gonePlaces(scoped.map(p => ({ type: p.placeType, id: p.placeId })))
  const { count } = gone.length > 0 ? await prisma.memoryItem.deleteMany({ where: { OR: gone } }) : { count: 0 }

  const savedIn = await prisma.memoryItem.findMany({
    where: { savedInPlaceId: { not: null } },
    distinct: ['savedInPlaceType', 'savedInPlaceId'],
    select: { savedInPlaceType: true, savedInPlaceId: true },
  })
  const goneSavedIn = await gonePlaces(savedIn.map(p => ({ type: p.savedInPlaceType, id: p.savedInPlaceId })))
  if (goneSavedIn.length > 0) {
    await prisma.memoryItem.updateMany({
      where: { OR: goneSavedIn.map(p => ({ savedInPlaceType: p.placeType, savedInPlaceId: p.placeId })) },
      data: { savedInPlaceType: null, savedInPlaceId: null },
    })
  }
  return count
}
