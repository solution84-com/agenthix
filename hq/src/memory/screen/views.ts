import { prisma } from 'wasp/server'
import type { MemoryItemKindValue, MemoryItemView, MemoryPlaceView } from '../../shared/memory/protocol'

type Row = {
  id: string; key: string; agentId: string | null; placeType: string | null; placeId: string | null
  writtenByAgentId: string | null; savedInPlaceType: string | null; savedInPlaceId: string | null
  savedInConversationId: string | null
  title: string; body: string; kind: string; tags: string[]; archived: boolean
  recallCount: number; usedCount: number; lastRecalledAt: Date | null; createdAt: Date; updatedAt: Date
}

export const VIEW_SELECT = {
  id: true, key: true, agentId: true, placeType: true, placeId: true, writtenByAgentId: true, savedInPlaceType: true,
  savedInPlaceId: true, savedInConversationId: true, title: true, body: true, kind: true, tags: true, archived: true, recallCount: true,
  usedCount: true, lastRecalledAt: true, createdAt: true, updatedAt: true,
} as const

export const idsOf = (values: (string | null)[]): string[] => [...new Set(values.filter((v): v is string => !!v))]

/** The current names of the agents and projects named, one lookup of each: a rename changes nothing stored. */
export async function namesOf(agentIds: string[], projectIds: string[]) {
  const none: { id: string; name: string }[] = []
  const [agents, projects] = await Promise.all([
    agentIds.length ? prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }) : none,
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : none,
  ])
  const agent = new Map<string, string>(agents.map(a => [a.id, a.name]))
  const project = new Map<string, string>(projects.map(p => [p.id, p.name]))
  return {
    agent: (id: string | null) => (id ? { id, name: agent.get(id) ?? 'An agent' } : null),
    // A person's own space reads "Your space": the memory screen is only ever the person's own.
    place: (type: string | null, id: string | null): MemoryPlaceView | null => {
      if (type === 'user' && id) return { type: 'user', id, name: 'Your space' }
      if (type === 'project' && id) return { type: 'project', id, name: project.get(id) ?? 'A project' }
      return null
    },
  }
}

export async function viewsOf(rows: Row[]): Promise<MemoryItemView[]> {
  if (rows.length === 0) return []
  const { agent, place } = await namesOf(
    idsOf(rows.flatMap(r => [r.agentId, r.writtenByAgentId])),
    idsOf(rows.flatMap(r => [
      r.placeType === 'project' ? r.placeId : null, r.savedInPlaceType === 'project' ? r.savedInPlaceId : null,
    ])),
  )
  return rows.map(r => ({
    id: r.id, key: r.key,
    agent: agent(r.agentId), place: place(r.placeType, r.placeId),
    savedBy: agent(r.writtenByAgentId), savedIn: place(r.savedInPlaceType, r.savedInPlaceId),
    savedInConversationId: r.savedInConversationId,
    title: r.title, body: r.body, kind: r.kind as MemoryItemKindValue, tags: r.tags, archived: r.archived,
    recallCount: r.recallCount, usedCount: r.usedCount, lastRecalledAt: r.lastRecalledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  }))
}
