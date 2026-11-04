/**
 * What a run's knowledge call reaches, against real projects (agent knowledge spec, part 4, *Who reaches what*; @SC-1408):
 * a shared project's own storage, a person's own space, another personal project's own storage, and nothing for a
 * project that is gone. Built from the run's capability alone.
 */
import { describe, it, expect, vi } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { createProject, createUser } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import { runPlaces } from '../knowledgeReach'

const claims = (over: Partial<CapabilityClaims>): CapabilityClaims => ({
  tokenType: 'capability', userId: 'u', runner: { kind: 'person', userId: 'u' }, startedBy: 'person', agentId: 'a', sessionId: 's',
  projectId: null, workspaceId: null, taskId: null, role: null, siteId: 'site-1',
  permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] }, ...over,
})

describe("a run's reach against real projects @SC-1408", () => {
  it("a shared project's run reaches the project's own storage under its slug", async () => {
    const shop = await createProject({ name: 'Shop', slug: 'shop' })
    expect(await runPlaces(claims({ projectId: shop.id }))).toEqual([{ level: 'shop', owner: { ownerType: 'project', ownerId: shop.id } }])
  })

  it("a run in a person's own space reaches their own storage, as personal", async () => {
    const me = await createUser()
    const space = await createProject({ name: 'Your space', personalOwnerId: me.id, personalSpace: true })
    expect(await runPlaces(claims({ projectId: space.id, userId: me.id }))).toEqual([{ level: 'personal', owner: { ownerType: 'user', ownerId: me.id } }])
  })

  it("a chat outside any project reaches the runner's own space, and a task's run with no project reaches nothing", async () => {
    const me = await createUser()
    expect(await runPlaces(claims({ runner: { kind: 'person', userId: me.id } }))).toEqual([{ level: 'personal', owner: { ownerType: 'user', ownerId: me.id } }])
    expect(await runPlaces(claims({ taskId: 't1', runner: { kind: 'person', userId: me.id } }))).toEqual([])
  })

  it("another personal project (not the space) reaches its own storage under its slug, never the person's space", async () => {
    const owner = await createUser()
    const side = await createProject({ name: 'Side', slug: 'side', personalOwnerId: owner.id, personalSpace: false })
    expect(await runPlaces(claims({ projectId: side.id }))).toEqual([{ level: 'side', owner: { ownerType: 'project', ownerId: side.id } }])
  })

  it('a project that is gone reaches no place', async () => {
    expect(await runPlaces(claims({ projectId: '00000000-0000-4000-8000-000000000000' }))).toEqual([])
  })
})
