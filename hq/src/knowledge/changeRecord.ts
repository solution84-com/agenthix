/**
 * hq's record of every change the gate accepted (G5, ADR-0151): the place, the page, what kind of change, the page's
 * version after it, and who — a person, or an agent with the person it acted for and its conversation or run.
 */
import { prisma } from 'wasp/server'
import type { KnowledgeChangeKind as PrismaChangeKind, KnowledgePlaceKind } from '@prisma/client'
import type { KnowledgeChangeKind } from '@agenthix/core'
import type { KnowledgeChangeEntry } from './deps'

const KIND: Record<KnowledgeChangeKind, PrismaChangeKind> = {
  created: 'CREATED',
  edited: 'EDITED',
  moved: 'MOVED',
  deleted: 'DELETED',
  restored: 'RESTORED',
}

const PLACE: Record<KnowledgeChangeEntry['owner']['ownerType'], KnowledgePlaceKind> = { project: 'PROJECT', user: 'USER', org: 'ORG' }

export async function recordKnowledgeChange(entry: KnowledgeChangeEntry): Promise<void> {
  const { owner, reach } = entry
  await prisma.knowledgeChange.create({
    data: {
      placeKind: PLACE[owner.ownerType],
      projectId: owner.ownerType === 'project' ? owner.ownerId : null,
      userId: owner.ownerType === 'user' ? owner.ownerId : null,
      page: entry.page,
      kind: KIND[entry.kind],
      version: entry.version,
      actorUserId: reach.userId,
      agentId: reach.agent?.agentId ?? null,
      conversationId: reach.agent?.conversationId ?? null,
      runId: reach.agent?.runId ?? null,
    },
  })
}
