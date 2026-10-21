/**
 * What a person's pins point at, resolved under the same visibility rule as
 * everything else they read (spec §6.4): a project or board only while they are
 * entitled to its project, an agent while it exists (agents are the
 * organisation's). A pin whose item they cannot see is kept and left out, so it
 * comes back if their access does.
 */
import { HttpError, prisma } from 'wasp/server'
import { entitledProjectsFilter } from '../projects/membership'
import type { PinKindName, PinnedItem } from './pinTypes'

type Resolved = Omit<PinnedItem, 'id' | 'kind'>

async function visibleProjects(ids: string[], userId: string): Promise<Map<string, Resolved>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.project.findMany({
    where: { id: { in: ids }, ...entitledProjectsFilter(userId) },
    select: { id: true, name: true, key: true },
  })
  return new Map(rows.map((p) => [p.id, { itemId: p.id, name: p.name, href: `/projects/${p.key}`, avatarUrl: null }]))
}

async function visibleBoards(ids: string[], userId: string): Promise<Map<string, Resolved>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.board.findMany({
    where: { id: { in: ids }, project: entitledProjectsFilter(userId) },
    select: { id: true, name: true, project: { select: { key: true } } },
  })
  return new Map(rows.map((b) => [
    b.id,
    { itemId: b.id, name: b.name, href: `/projects/${b.project.key}/boards/${b.id}`, avatarUrl: null },
  ]))
}

async function visibleAgents(ids: string[]): Promise<Map<string, Resolved>> {
  if (ids.length === 0) return new Map()
  const rows = await prisma.agent.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, handle: true, avatarUrl: true },
  })
  return new Map(rows.map((a) => [a.id, { itemId: a.id, name: a.name, href: `/agents/${a.handle}`, avatarUrl: a.avatarUrl }]))
}

async function visibleItems(kind: PinKindName, ids: string[], userId: string): Promise<Map<string, Resolved>> {
  if (kind === 'PROJECT') return visibleProjects(ids, userId)
  if (kind === 'BOARD') return visibleBoards(ids, userId)
  return visibleAgents(ids)
}

/** The person's pins in their order, each resolved, leaving out what they cannot see. */
export async function visiblePinnedItems(userId: string): Promise<PinnedItem[]> {
  const pins = await prisma.pin.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, kind: true, itemId: true },
  })
  const idsOf = (kind: PinKindName) => pins.filter((p) => p.kind === kind).map((p) => p.itemId)
  const [projects, boards, agents] = await Promise.all([
    visibleItems('PROJECT', idsOf('PROJECT'), userId),
    visibleItems('BOARD', idsOf('BOARD'), userId),
    visibleItems('AGENT', idsOf('AGENT'), userId),
  ])
  const byKind = { PROJECT: projects, BOARD: boards, AGENT: agents }

  const items: PinnedItem[] = []
  for (const pin of pins) {
    const item = byKind[pin.kind].get(pin.itemId)
    if (item) items.push({ id: pin.id, kind: pin.kind, ...item })
  }
  return items
}

/** Refuses an item the person cannot see exactly as one that does not exist. */
export async function requireVisibleItem(kind: PinKindName, itemId: string, userId: string): Promise<void> {
  const found = await visibleItems(kind, [itemId], userId)
  if (!found.has(itemId)) throw new HttpError(404, 'Not found')
}
