/**
 * A turn's capability, against the real test database (adr-0082): minted for the person whose message the turn
 * answers, as they stand now, in the conversation's place, with the agent's tool permissions there — the
 * agent's own with that place's narrowing on top, as a run in the same place has.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

import { mintTurnCapability, TURN_CAPABILITY_TTL_MS } from '../mintTurnCapability'
import { ControlPlaneError } from '../../../server/controlplane/types'
import type { ConversationHomeRef } from '../../contract'

let member: { id: string }
let outsider: { id: string }
let project: { id: string }

beforeEach(async () => {
  member = await createUserWithRole('MEMBER')
  outsider = await createUserWithRole('ADMIN')
  project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
  await prisma.agent.create({
    data: {
      id: 'agent-1', name: 'Agent', handle: 'agent-1', approval: 'deferred',
      allowedTools: [{ name: 'list_tasks', state: 'always' }, { name: 'delete_task', state: 'always' }],
    },
  })
})

const home = (over: Partial<ConversationHomeRef>): ConversationHomeRef => ({
  id: 'conv-1', home: 'PERSON', projectId: null, taskId: null, openedById: member.id, agentId: 'agent-1', ...over,
})

const mint = (conversation: ConversationHomeRef, actingUserId: string | null) =>
  mintTurnCapability({ conversation, turnId: 'turn-1', agentId: 'agent-1', actingUserId })

async function refused(promise: Promise<unknown>) {
  const err = await promise.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  return err as ControlPlaneError
}

describe("a turn's capability @SC-950", () => {
  it("in a person's own space carries that person, their role now, and the person's narrowing of the agent", async () => {
    await prisma.agentOverride.create({
      data: { boundaryType: 'user', boundaryId: member.id, agentId: 'agent-1', allowedTools: [{ name: 'delete_task', state: 'never' }] },
    })
    const before = Date.now()
    const cap = await mint(home({}), member.id)
    expect(cap).toMatchObject({ conversationId: 'conv-1', turnId: 'turn-1', agentId: 'agent-1', home: 'PERSON', projectId: null, taskId: null, actingUserId: member.id, role: 'MEMBER' })
    expect(cap.permissions.bypassed).toBe(false)
    expect(cap.permissions.neverTools).toContain('delete_task')
    expect(cap.permissions.allowedTools).toContainEqual(expect.objectContaining({ name: 'list_tasks', state: 'always' }))
    expect(cap.expiresAt).toBeGreaterThanOrEqual(before + TURN_CAPABILITY_TTL_MS)
  })

  it("in a project takes the project's narrowing, never the person's own", async () => {
    await prisma.agentOverride.create({
      data: { boundaryType: 'user', boundaryId: member.id, agentId: 'agent-1', allowedTools: [{ name: 'list_tasks', state: 'never' }] },
    })
    await prisma.agentOverride.create({
      data: { boundaryType: 'project', boundaryId: project.id, agentId: 'agent-1', allowedTools: [{ name: 'delete_task', state: 'never' }] },
    })
    const cap = await mint(home({ home: 'PROJECT', projectId: project.id }), member.id)
    expect(cap.projectId).toBe(project.id)
    expect(cap.permissions.neverTools).toEqual(['delete_task'])
  })

  it("in a task's thread is confined to the task's project as it is now", async () => {
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
    const cap = await mint(home({ home: 'TASK', taskId: task.id, projectId: 'stale' }), member.id)
    expect(cap).toMatchObject({ home: 'TASK', projectId: project.id, taskId: task.id })
  })

  it('of a bypassed agent lists no tools, as a run of it does', async () => {
    await prisma.agent.update({ where: { id: 'agent-1' }, data: { approval: 'bypassed' } })
    const cap = await mint(home({}), member.id)
    expect(cap.permissions).toMatchObject({ bypassed: true, allowedTools: [], neverTools: [] })
  })

  it("answering no one reads as the conversation's opener, and in a task's thread as the person the task is for", async () => {
    expect(await mint(home({ home: 'PROJECT', projectId: project.id }), null)).toMatchObject({ actingUserId: null, readerUserId: member.id, role: null })
    const task = await createTestTask({ data: { title: 'T', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
    expect(await mint(home({ home: 'TASK', taskId: task.id, openedById: 'someone-else' }), null)).toMatchObject({ actingUserId: null, readerUserId: member.id })
  })
})

describe('no capability is minted @SC-950', () => {
  it("for someone else in a person's own space", async () => {
    await refused(mint(home({}), outsider.id))
  })

  it("for someone who is not a member of the conversation's project, whatever their organisation role", async () => {
    await refused(mint(home({ home: 'PROJECT', projectId: project.id }), outsider.id))
  })

  it('for someone who has left the organisation', async () => {
    await prisma.user.update({ where: { id: member.id }, data: { deactivatedAt: new Date() } })
    await refused(mint(home({}), member.id))
  })

  it("for a task's thread whose task is gone, or a project conversation that names no project", async () => {
    await refused(mint(home({ home: 'TASK', taskId: 'gone' }), member.id))
    await refused(mint(home({ home: 'PROJECT', projectId: null }), member.id))
  })
})
