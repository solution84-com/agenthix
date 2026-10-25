// The change record (G5) and the organisation's placement against the real test database: each accepted change is a
// KnowledgeChange row naming its place and who made it; the organisation's knowledge is placed once, on the default site.
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, ensureExecutionSite } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { recordKnowledgeChange } from '../changeRecord'
import { ensureOrgKnowledgePlacement } from '../../storage/storageSite'

describe('recordKnowledgeChange @SC-1406', () => {
  it('records an agent\'s change to a project page with its person and conversation', async () => {
    const site = await ensureExecutionSite()
    const project = await createProject({ executionSiteId: site.id })
    const person = await createUser()
    await recordKnowledgeChange({
      owner: { ownerType: 'project', ownerId: project.id },
      page: 'processes/release.md',
      kind: 'edited',
      version: 'a'.repeat(64),
      reach: { userId: person.id, agent: { agentId: 'agent-1', conversationId: 'conv-1' } },
    })
    const rows = await prisma.knowledgeChange.findMany()
    expect(rows).toEqual([expect.objectContaining({
      placeKind: 'PROJECT', projectId: project.id, userId: null, page: 'processes/release.md', kind: 'EDITED',
      version: 'a'.repeat(64), actorUserId: person.id, agentId: 'agent-1', conversationId: 'conv-1', runId: null,
    })])
  })

  it('records a person\'s change to their own and to the organisation\'s pages, with no agent', async () => {
    const person = await createUser()
    await recordKnowledgeChange({ owner: { ownerType: 'user', ownerId: person.id }, page: 'n.md', kind: 'created', version: 'b'.repeat(64), reach: { userId: person.id } })
    await recordKnowledgeChange({ owner: { ownerType: 'org', ownerId: 'org' }, page: 'o.md', kind: 'deleted', version: 'c'.repeat(64), reach: { userId: person.id } })
    const rows = await prisma.knowledgeChange.findMany({ orderBy: { page: 'asc' } })
    expect(rows.map(r => [r.placeKind, r.userId, r.projectId, r.kind, r.actorUserId, r.agentId])).toEqual([
      ['USER', person.id, null, 'CREATED', person.id, null],
      ['ORG', null, null, 'DELETED', person.id, null],
    ])
  })
})

describe('ensureOrgKnowledgePlacement @SC-1433', () => {
  it('places the organisation\'s knowledge on the default site once, and answers the same site after', async () => {
    const site = await ensureExecutionSite()
    const first = await ensureOrgKnowledgePlacement()
    expect(first).toBe(site.siteId)
    expect(await ensureOrgKnowledgePlacement()).toBe(first)
    expect(await prisma.orgKnowledgePlacement.count()).toBe(1)
  })
})
