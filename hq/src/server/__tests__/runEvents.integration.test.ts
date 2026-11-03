/**
 * `runs:changed` goes to the people who may read the run's session, against the real test DB: a chat's person, a
 * task session's project members — never the admin a task session's `userId` names for routing, who may not be
 * in the project at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createSession, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { emitRunChanged } from '../runEvents'

let sentTo: string[]
beforeEach(() => {
  sentTo = []
  ;(globalThis as { __wasp_io__?: unknown }).__wasp_io__ = {
    to: (room: string) => ({ emit: (event: string) => { if (event === 'runs:changed') sentTo.push(room) } }),
  }
})
afterEach(() => { delete (globalThis as { __wasp_io__?: unknown }).__wasp_io__ })

describe('runs:changed', () => {
  it("reaches a task session's project members, and not the routing admin outside the project", async () => {
    const [member, routingAdmin] = [await createUser(), await createUser()]
    const agent = await createAgent()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
    const session = await createSession({ userId: routingAdmin.id, agentId: agent.id, sessionType: 'task', taskId: task.id })

    await emitRunChanged(session.id, 'run-1', 'COMPLETED', routingAdmin.id)
    expect(sentTo).toEqual([`person:${member.id}`])
  })

  it("reaches a chat's person", async () => {
    const person = await createUser()
    const session = await createSession({ userId: person.id, agentId: (await createAgent()).id, sessionType: 'chat' })
    await emitRunChanged(session.id, 'run-1', 'RUNNING')
    expect(sentTo).toEqual([`person:${person.id}`])
  })

  it('reaches nobody for a task session whose task is gone', async () => {
    const routingAdmin = await createUser()
    const session = await createSession({ userId: routingAdmin.id, agentId: (await createAgent()).id, sessionType: 'task' })
    await emitRunChanged(session.id, 'run-1', 'COMPLETED', routingAdmin.id)
    expect(sentTo).toEqual([])
  })
})
