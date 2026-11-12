/**
 * A visitor's own tasks (usability finding 9) against the real test database: two tasks for them in their own space,
 * planned and with no agent, which no one else sees; the sample's projects get none.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { giveVisitorTasks, VISITOR_TASKS } from '../visitorTasks'

describe("a visitor's own tasks", () => {
  it('are two tasks for them in their space, planned, with no agent; the sample gets none @SC-1952', async () => {
    const sample = await createProject()
    const visitor = await createUser()
    expect(await giveVisitorTasks(visitor.id)).toBe(2)
    const tasks = await prisma.task.findMany({
      where: { onBehalfOfUserId: visitor.id },
      select: { title: true, state: true, assignedAgentId: true, project: { select: { personalOwnerId: true, personalSpace: true } } },
      orderBy: { number: 'asc' },
    })
    expect(tasks.map(t => t.title)).toEqual(VISITOR_TASKS.map(t => t.title))
    for (const t of tasks) {
      expect(t).toMatchObject({ state: 'TODO', assignedAgentId: null, project: { personalOwnerId: visitor.id, personalSpace: true } })
    }
    expect(await prisma.task.count({ where: { projectId: sample.id } })).toBe(0)
  })
})
