/**
 * Whose behalf a task created or queued over the control plane is done on
 * (adr-0089), against the real test database: a task run's task's person, a
 * chat's own person, a connection's person — and never a run that is no
 * person's, or a person who cannot reach the project.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createUser, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { originOfRun } from '../runOnBehalfOf'
import type { CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { claims, expectForbidden } from './controlPlaneFixtures'

let routingAdmin: { id: string }
let dana: { id: string }
let project: { id: string }
let task: { id: string }

beforeEach(async () => {
  routingAdmin = await createUser()
  dana = await createUser()
  project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: dana.id } })
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: dana.id } })
})

function session(id: string, data: { sessionType: string; userId: string; taskId?: string | null }) {
  return prisma.agentSession.create({ data: { id, agentId: 'agent-1', ...data } })
}
const run = (over: Partial<CapabilityClaims> = {}): CallerContext =>
  ({ kind: 'run', claims: claims({ userId: routingAdmin.id, role: null, projectId: project.id, sessionId: 'sess-1', ...over }) })

describe('originOfRun', () => {
  it("a task run is on behalf of its task's person, never the session's routing identity", async () => {
    await session('sess-1', { sessionType: 'task', userId: routingAdmin.id, taskId: task.id })
    const origin = await originOfRun(run({ taskId: task.id }), project.id, 'create_task')
    expect(origin).toEqual({ onBehalfOfUserId: dana.id, queuer: { kind: 'agent', agentId: 'agent-1', sessionId: 'sess-1' } })
  })

  describe("a task run carries its person in the capability (spec §9) @SC-520", () => {
    let sam: { id: string }
    beforeEach(async () => {
      sam = await createUser()
      await prisma.projectMember.create({ data: { projectId: project.id, userId: sam.id } })
      await session('sess-1', { sessionType: 'task', userId: routingAdmin.id, taskId: task.id })
    })

    it('a run started by a message into the task\'s session is on behalf of its sender', async () => {
      // The task's last run was started by someone else; the message's sender is who this run is for.
      await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: dana.id } })
      const origin = await originOfRun(run({ taskId: task.id, onBehalfOfUserId: sam.id }), project.id, 'create_task')
      expect(origin.onBehalfOfUserId).toBe(sam.id)
    })

    it('a task run a person started is on behalf of that person', async () => {
      await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: sam.id } })
      const origin = await originOfRun(run({ taskId: task.id, onBehalfOfUserId: sam.id }), project.id, 'create_task')
      expect(origin.onBehalfOfUserId).toBe(sam.id)
    })

    it("a run nobody started is on the task's person, never whoever the task last recorded", async () => {
      await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: sam.id } })
      const origin = await originOfRun(run({ taskId: task.id, startedBy: 'pulse' }), project.id, 'create_task')
      expect(origin.onBehalfOfUserId).toBe(dana.id)
    })

    it("a token without the claim is never read as a person's start", async () => {
      await prisma.task.update({ where: { id: task.id }, data: { runOnBehalfOfUserId: sam.id } })
      const origin = await originOfRun(run({ taskId: task.id, startedBy: 'person' }), project.id, 'create_task')
      expect(origin.onBehalfOfUserId).toBe(dana.id)
    })

    it("still checks the run's person can reach the project", async () => {
      await prisma.projectMember.deleteMany({ where: { userId: sam.id } })
      const err = await expectForbidden(originOfRun(run({ taskId: task.id, onBehalfOfUserId: sam.id }), project.id, 'create_task'))
      expect(err.message).toContain('cannot work in this project')
    })
  })

  it('a chat is on behalf of the person whose conversation it is', async () => {
    await session('sess-1', { sessionType: 'chat', userId: dana.id })
    const origin = await originOfRun(run({ userId: dana.id, role: 'MEMBER', projectId: null }), project.id, 'create_task')
    expect(origin.onBehalfOfUserId).toBe(dana.id)
  })

  it("a person's connection: on behalf of its person, through the connection (adr-0090)", async () => {
    const origin = await originOfRun(connectionCaller({ userId: dana.id, connectionId: 'conn-3' }), project.id, 'create_task')
    expect(origin).toEqual({ onBehalfOfUserId: dana.id, queuer: { kind: 'person', userId: dana.id, connectionId: 'conn-3' }, connectionId: 'conn-3' })
  })

  it('refuses a connection whose person cannot reach the project', async () => {
    const err = await expectForbidden(originOfRun(connectionCaller({ userId: routingAdmin.id }), project.id, 'create_task'))
    expect(err.message).toContain('cannot work in this project')
  })

  it("refuses a run that is neither a task's nor a person's chat", async () => {
    await session('sess-1', { sessionType: 'task', userId: routingAdmin.id })
    const err = await expectForbidden(originOfRun(run(), project.id, 'create_task'))
    expect(err.message).toContain('not on behalf of any person')
  })

  it('refuses when the person behind the run cannot reach the project', async () => {
    await prisma.projectMember.deleteMany()
    await session('sess-1', { sessionType: 'task', userId: routingAdmin.id, taskId: task.id })
    const err = await expectForbidden(originOfRun(run({ taskId: task.id }), project.id, 'create_task'))
    expect(err.message).toContain('cannot work in this project')
  })

  it('refuses when the person behind the run has been removed, even from an open project', async () => {
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'OPEN' } })
    await prisma.task.update({ where: { id: task.id }, data: { onBehalfOfUserId: 'gone' } })
    await session('sess-1', { sessionType: 'task', userId: routingAdmin.id, taskId: task.id })
    const err = await expectForbidden(originOfRun(run({ taskId: task.id }), project.id, 'create_task'))
    expect(err.message).toContain('cannot work in this project')
  })

  it('answers not_found for a session that no longer exists', async () => {
    const err = await originOfRun(run(), project.id, 'create_task').catch((e) => e)
    expect(err.code).toBe('not_found')
  })
})
