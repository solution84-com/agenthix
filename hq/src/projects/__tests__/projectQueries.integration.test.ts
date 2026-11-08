import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

// getProjectByKey lookup, against the real test DB (ADR-0035). getProjectByKey reads through
// `context.entities`. Side-effecting collaborators are mocked to no-ops.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))

import { getProjectByKey } from '../queries'

let n = 0
function createProjectRow(data: Record<string, unknown> = {}) {
  return createProject({ name: 'P', key: `PQ${(n++).toString().padStart(2, '0')}`.slice(0, 6), ...data })
}
const userCtx = { user: { id: 'u1' }, entities: { Project: prisma.project } } as any
/** A call context for a real person who is a member of `project`. */
async function memberCtx(project: { id: string }) {
  const user = await createUser()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id } })
  return { user, entities: { Project: prisma.project } } as any
}

beforeEach(() => vi.clearAllMocks())

describe('getProjectByKey @SC-159', () => {
  // SC-159 — opening a project by key; an unknown key returns 404.
  it('returns the project matching the key', async () => {
    const project = await createProjectRow()
    const found = await getProjectByKey({ key: project.key }, await memberCtx(project))
    expect(found.id).toBe(project.id)
  })

  it('throws 404 for an unknown key', async () => {
    await expect(getProjectByKey({ key: 'ZZZZ' }, userCtx)).rejects.toMatchObject({ statusCode: 404 })
  })
})
