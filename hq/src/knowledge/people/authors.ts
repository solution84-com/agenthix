/**
 * Who made each change, from hq's record (`KnowledgeChange`, G5), joined to a site's pages and kept versions by page
 * and version (core's `locationKnowledge.ts` says why the site never holds who). A person is named as everywhere
 * (`personSummary`): "Former member" once erased or gone. An agent is named with the person it answered.
 */
import { prisma } from 'wasp/server'
import type { KnowledgeChangeKind as PrismaChangeKind, KnowledgePlaceKind, Prisma } from '@prisma/client'
import type { KnowledgeChangeKind, KnowledgeOwnerRef } from '@agenthix/core'
import { missingPerson, personSummary, PERSON_SELECT } from '../../server/identity/personSummary'
import type { ChangeAuthors } from './deps'
import type { ChangeAuthorView, KnowledgeLastChange } from './types'

export const REMOVED_AGENT = 'A removed agent'

const KIND: Record<PrismaChangeKind, KnowledgeChangeKind> = {
  CREATED: 'created', EDITED: 'edited', MOVED: 'moved', DELETED: 'deleted', RESTORED: 'restored',
}
const PLACE: Record<KnowledgeOwnerRef['ownerType'], KnowledgePlaceKind> = { project: 'PROJECT', user: 'USER', org: 'ORG' }

type Row = {
  page: string
  kind: PrismaChangeKind
  version: string
  createdAt: Date
  actorUserId: string | null
  agentId: string | null
  conversationId: string | null
  runId: string | null
}

function placeWhere(ref: KnowledgeOwnerRef): Prisma.KnowledgeChangeWhereInput {
  return {
    placeKind: PLACE[ref.ownerType],
    projectId: ref.ownerType === 'project' ? ref.ownerId : null,
    userId: ref.ownerType === 'user' ? ref.ownerId : null,
  }
}

async function rowsFor(ref: KnowledgeOwnerRef, where: Prisma.KnowledgeChangeWhereInput): Promise<Row[]> {
  return prisma.knowledgeChange.findMany({
    where: { ...placeWhere(ref), ...where },
    orderBy: { createdAt: 'desc' },
    select: { page: true, kind: true, version: true, createdAt: true, actorUserId: true, agentId: true, conversationId: true, runId: true },
  })
}

/** Every row's author, with the people and agents they name read once. */
async function authorsOf(rows: Row[]): Promise<(row: Row) => ChangeAuthorView> {
  const userIds = [...new Set(rows.flatMap(r => (r.actorUserId ? [r.actorUserId] : [])))]
  const agentIds = [...new Set(rows.flatMap(r => (r.agentId ? [r.agentId] : [])))]
  const [people, agents] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: PERSON_SELECT }),
    prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } }),
  ])
  const personName = new Map<string, string>(people.map((p): [string, string] => [p.id, personSummary(p).name]))
  const agentName = new Map<string, string>(agents.map((a): [string, string] => [a.id, a.name]))
  const nameOf = (userId: string | null) => (userId ? personName.get(userId) ?? missingPerson(userId).name : missingPerson('').name)
  return row => {
    if (!row.agentId) return { kind: 'person', name: nameOf(row.actorUserId) }
    return {
      kind: 'agent',
      agentName: agentName.get(row.agentId) ?? REMOVED_AGENT,
      forName: nameOf(row.actorUserId),
      ...(row.conversationId ? { conversationId: row.conversationId } : {}),
      ...(row.runId ? { runId: row.runId } : {}),
    }
  }
}

const unique = (xs: string[]) => [...new Set(xs)]

export const changeAuthors: ChangeAuthors = {
  async lastChanges(ref, pages) {
    const out = new Map<string, KnowledgeLastChange>()
    const wanted = pages.filter(p => p.version)
    if (!wanted.length) return out
    const rows = await rowsFor(ref, { page: { in: unique(wanted.map(p => p.page)) }, version: { in: unique(wanted.map(p => p.version)) }, kind: { not: 'DELETED' } })
    const versionOf = new Map(wanted.map(p => [p.page, p.version]))
    const latest = new Map<string, Row>()
    for (const row of rows) if (versionOf.get(row.page) === row.version && !latest.has(row.page)) latest.set(row.page, row)
    const author = await authorsOf([...latest.values()])
    for (const [page, row] of latest) out.set(page, { at: row.createdAt.toISOString(), by: author(row), change: KIND[row.kind] })
    return out
  },

  async ofVersions(ref, page, versions) {
    const out = new Map<string, ChangeAuthorView>()
    if (!versions.length) return out
    const rows = await rowsFor(ref, { page, version: { in: unique(versions.map(v => v.version)) }, kind: { not: 'DELETED' } })
    const author = await authorsOf(rows)
    for (const v of versions) {
      // The change that made this text, before it was kept: the newest one recorded by then. The site's clock is not
      // hq's, so with none before it (a clock behind), the earliest that made this text.
      const saved = Date.parse(v.savedAt)
      const made = rows.filter(r => r.version === v.version)
      const row = made.find(r => Number.isNaN(saved) || r.createdAt.getTime() <= saved) ?? made.at(-1)
      if (row) out.set(v.id, author(row))
    }
    return out
  },

  async deletions(ref, pages) {
    const out = new Map<string, ChangeAuthorView>()
    if (!pages.length) return out
    const rows = await rowsFor(ref, { page: { in: unique(pages.map(p => p.page)) }, kind: 'DELETED' })
    const author = await authorsOf(rows)
    for (const p of pages) {
      const row = rows.find(r => r.page === p.page && r.version === p.version) ?? rows.find(r => r.page === p.page)
      if (row) out.set(p.page, author(row))
    }
    return out
  },
}
