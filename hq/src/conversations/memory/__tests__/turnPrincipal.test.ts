/**
 * Whose memory a turn's probe searches (conversation layer spec, Turns that answer no person): the person the
 * turn answers; for a report, the person the operation was for; for work of several people, none of them. The
 * place is the conversation's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  operations: [] as { id: string; authorisedById: string }[],
  left: new Set<string>(),
  personalOwner: null as string | null,
  task: null as { projectId: string; ownerType: 'user' | 'project'; ownerId: string } | null,
}))

vi.mock('wasp/server', () => ({
  prisma: {
    operation: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => db.operations.filter(o => where.id.in.includes(o.id)) },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ deactivatedAt: db.left.has(where.id) ? new Date() : null }) },
  },
}))
vi.mock('../../../projects/personalProject', () => ({
  personalOwnerOf: async () => db.personalOwner,
  taskRunOwner: async () => db.task,
}))

import { turnPrincipal } from '../turnPrincipal'

const personal = { id: 'c1', home: 'PERSON' as const, projectId: null, taskId: null, openedById: 'opener', agentId: 'a1' }
const project = { ...personal, home: 'PROJECT' as const, projectId: 'p1' }
const task = { ...personal, home: 'TASK' as const, taskId: 'task1' }

beforeEach(() => {
  db.operations = [{ id: 'op1', authorisedById: 'alice' }, { id: 'op2', authorisedById: 'alice' }, { id: 'op3', authorisedById: 'bob' }]
  db.left = new Set()
  db.personalOwner = null
  db.task = null
})

describe('turnPrincipal @SC-986', () => {
  it('is for the person a message turn or a continuation answers', async () => {
    expect(await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'MESSAGE', actingUserId: 'carol', operationIds: [] }))
      .toEqual({ personId: 'carol', agentId: 'a1', place: { type: 'project', id: 'p1' } })
    expect((await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'CONTINUATION', actingUserId: 'alice', operationIds: ['op3'] })).personId)
      .toBe('alice')
  })

  it('is, for a report, the person the operations were for', async () => {
    const principal = await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'REPORT', actingUserId: null, operationIds: ['op1', 'op2'] })
    expect(principal).toEqual({ personId: 'alice', agentId: 'a1', place: { type: 'project', id: 'p1' } })
  })

  it('is for no person when a report covers several people\'s work, or its person has left', async () => {
    expect((await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'REPORT', actingUserId: null, operationIds: ['op1', 'op3'] })).personId).toBeNull()
    db.left.add('alice')
    expect((await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'REPORT', actingUserId: null, operationIds: ['op1'] })).personId).toBeNull()
  })

  it('places the memory in the opener\'s own space, a personal project\'s person, or the task\'s owner', async () => {
    expect((await turnPrincipal({ conversation: personal, agentId: 'a1', trigger: 'MESSAGE', actingUserId: 'opener', operationIds: [] })).place)
      .toEqual({ type: 'user', id: 'opener' })
    db.personalOwner = 'dana'
    expect((await turnPrincipal({ conversation: project, agentId: 'a1', trigger: 'MESSAGE', actingUserId: 'dana', operationIds: [] })).place)
      .toEqual({ type: 'user', id: 'dana' })
    db.task = { projectId: 'p2', ownerType: 'project', ownerId: 'p2' }
    expect((await turnPrincipal({ conversation: task, agentId: 'a1', trigger: 'MESSAGE', actingUserId: 'carol', operationIds: [] })).place)
      .toEqual({ type: 'project', id: 'p2' })
  })
})
