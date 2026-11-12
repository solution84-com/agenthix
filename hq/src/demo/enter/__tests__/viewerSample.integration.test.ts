import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../test/db'

// A visitor sees the sample and cannot change it (live demo spec, *Getting in*): no demo rule refuses it, the
// product's viewer role does (ADR-0102). Against the real test database, through the operation a board's drag calls.

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../projects/personalProject', () => ({ ensurePersonalProjectAfterSignup: async () => {} }))
vi.mock('../visitorTasks', () => ({ giveVisitorTasks: async () => 0 }))
vi.mock('wasp/auth/session', async () => {
  const { prisma } = await import('../../../test/db')
  return {
    createSession: async (authId: string) =>
      prisma.session.create({ data: { id: `s-${authId}`, expiresAt: new Date(Date.now() + 86_400_000), userId: authId } }),
  }
})

import { enterDemo } from '../enterDemo'
import { moveTask, getTaskTypes } from '../../../projects/taskTypeOperations'
import { setDemoModeForTests } from '../../demoMode'
import { resetRateLimit } from '../../../server/rateLimit'
import { createProject, createTestTask, createUserWithRole, joinProjectAs, taskTypeOf } from '../../../test/factories'

beforeEach(async () => {
  await resetRateLimit()
  setDemoModeForTests(true)
})
afterEach(() => setDemoModeForTests(null))

async function visitor(): Promise<string> {
  const entered = await enterDemo('203.0.113.20')
  if (!entered.ok) throw new Error('not entered')
  return (await prisma.session.findUniqueOrThrow({ where: { id: entered.sessionId }, include: { auth: true } })).auth.userId!
}

describe("the sample, to a visitor", () => {
  it('reads as it is, and a move of one of its tasks is refused by the product, leaving the task where it was @SC-1951', async () => {
    const sam = await createUserWithRole('ADMIN')
    const web = await createProject({ accessLevel: 'PRIVATE' })
    await joinProjectAs(web.id, sam.id, 'ADMIN')
    const typeId = await taskTypeOf(web.id)
    const task = await createTestTask({ data: { projectId: web.id, number: 1, title: 'Write the case-study page', typeId, onBehalfOfUserId: sam.id } })
    const me = await visitor()
    const ctx = { user: { id: me } } as Parameters<typeof moveTask>[1]

    expect((await getTaskTypes({ projectId: web.id }, ctx as Parameters<typeof getTaskTypes>[1])).length).toBeGreaterThan(0)
    await expect(moveTask({ taskId: task.id, state: 'DONE' }, ctx)).rejects.toMatchObject({ statusCode: 403 })
    const after = await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { state: true, columnId: true } })
    expect(after).toEqual({ state: task.state, columnId: task.columnId })
  })
})
