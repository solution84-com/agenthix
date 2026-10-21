import { prisma } from 'wasp/server'
import type { MemoryItemKindValue, MemoryItemView, MemoryScopeValue } from '../../shared/memory/protocol'
import { scopeLabel } from './scopeLabel'

type Row = {
  id: string; key: string; scope: string; agentId: string | null; placeType: string | null; placeId: string | null
  title: string; body: string; kind: string; tags: string[]; pinned: boolean; archived: boolean
  recallCount: number; usedCount: number; lastRecalledAt: Date | null; updatedAt: Date
  writtenByAgentId: string | null; writtenByUserId: string | null
}

export const VIEW_SELECT = {
  id: true, key: true, scope: true, agentId: true, placeType: true, placeId: true, title: true, body: true,
  kind: true, tags: true, pinned: true, archived: true, recallCount: true, usedCount: true, lastRecalledAt: true,
  updatedAt: true, writtenByAgentId: true, writtenByUserId: true,
} as const

const idsOf = (values: (string | null)[]): string[] => [...new Set(values.filter((v): v is string => !!v))]

/** Names for the agents, projects and people the rows refer to, one lookup of each. */
async function names(rows: Row[]) {
  const agentIds = idsOf(rows.flatMap(r => [r.agentId, r.writtenByAgentId]))
  const projectIds = idsOf(rows.map(r => (r.placeType === 'project' ? r.placeId : null)))
  const userIds = idsOf(rows.map(r => r.writtenByUserId))
  const [agents, projects, users] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
  ])
  return {
    agent: new Map<string, string>(agents.map(a => [a.id, a.name])),
    project: new Map<string, string>(projects.map(p => [p.id, p.name])),
    user: new Map<string, string | null>(users.map(u => [u.id, u.displayName])),
  }
}

export async function viewsOf(rows: Row[]): Promise<MemoryItemView[]> {
  if (rows.length === 0) return []
  const lookup = await names(rows)
  return rows.map(r => {
    const scope = r.scope as MemoryScopeValue
    const placeName = r.placeType === 'project' ? lookup.project.get(r.placeId!) ?? null : r.placeType === 'user' ? 'your own space' : null
    const writtenBy = r.writtenByAgentId
      ? lookup.agent.get(r.writtenByAgentId) ?? null
      : r.writtenByUserId ? (lookup.user.get(r.writtenByUserId) ?? 'a person') : null
    return {
      id: r.id, key: r.key, scope,
      scopeLabel: scopeLabel(scope, r.agentId ? lookup.agent.get(r.agentId) ?? null : null, placeName),
      agentId: r.agentId, placeType: r.placeType as 'user' | 'project' | null, placeId: r.placeId,
      title: r.title, body: r.body, kind: r.kind as MemoryItemKindValue, tags: r.tags,
      pinned: r.pinned, archived: r.archived, recallCount: r.recallCount, usedCount: r.usedCount,
      lastRecalledAt: r.lastRecalledAt?.toISOString() ?? null, writtenBy, updatedAt: r.updatedAt.toISOString(),
    }
  })
}
