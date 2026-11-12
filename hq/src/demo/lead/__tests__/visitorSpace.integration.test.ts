/**
 * A visitor's space made ready for an agent's work there, against the real test database: the agent on its roster
 * and an In review column on its Task type, each made once however often it is asked.
 */
import { describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createUser } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { visitorSpaceFor } from '../visitorSpace'

describe("a visitor's space, made ready for an agent @SC-1956", () => {
  it('is their own space, with the agent on its roster and one In review column, however often it is asked', async () => {
    const visitor = await createUser()
    const writer = await createAgent()
    const first = await visitorSpaceFor(visitor.id, writer.id)
    expect(await visitorSpaceFor(visitor.id, writer.id)).toBe(first)

    const space = await prisma.project.findUniqueOrThrow({ where: { id: first }, select: { personalOwnerId: true, personalSpace: true } })
    expect(space).toEqual({ personalOwnerId: visitor.id, personalSpace: true })
    expect(await prisma.projectAgent.count({ where: { projectId: first, agentId: writer.id } })).toBe(1)
    const columns = await prisma.typeColumn.findMany({ where: { type: { projectId: first, kind: 'TASK' } }, select: { name: true, state: true } })
    expect(columns.filter(c => c.name === 'In review')).toEqual([{ name: 'In review', state: 'IN_PROGRESS' }])
  })
})
