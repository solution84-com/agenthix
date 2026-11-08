import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

// Projects service behaviour, asserted against the real test DB
// (ADR-0035). The service imports `prisma` from `wasp/server`; in the vitest
// alias that module is the HttpError shim only, so we mock `wasp/server` to
// hand the service the real test-DB client (plus the real HttpError). The
// side-effecting collaborators (workspace provisioning, dashboard
// snapshot/activity, socket emits) are not the behaviour under test, so they
// are mocked to no-ops.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import {
  deleteProject,
  addAgentToProject,
  removeAgentFromProject,
} from '../projectService'

// ── Local helpers ─────────────────────────────────────────────────────────────
// A project goes through the shared factory, which places it on a registered
// site: placement resolves from the storage a run is for and refuses a project
// that names no machine, so a raw row here is one no install could produce.
let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`

function createProjectRow(data: Record<string, unknown> = {}) {
  return createProject({ name: 'Proj', key: `K${(n++).toString().padStart(2, '0')}`.slice(0, 6), ...data })
}
function createAgentRow(data: Record<string, unknown> = {}) {
  return prisma.agent.create({ data: { name: 'Agent', handle: uniq('agent'), ...data } as any })
}
async function createTaskRow(projectId: string, data: Record<string, unknown> = {}) {
  const agg = await prisma.task.aggregate({ where: { projectId }, _max: { number: true } })
  return createTestTask({
    data: { title: 'T', projectId, number: (agg._max.number ?? 0) + 1, onBehalfOfUserId: 'person-1', ...data } as any,
  })
}

beforeEach(() => vi.clearAllMocks())

describe('deleteProject @SC-019', () => {
  // SC-019 / SC-160 — deletion cascades to boards and tasks in one transaction.
  it('removes the project and cascades to its boards and tasks', async () => {
    const project = await createProjectRow()
    const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, view: 'STATE' } })
    const task = await createTaskRow(project.id)

    await deleteProject(project.id)

    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull()
    expect(await prisma.board.findUnique({ where: { id: board.id } })).toBeNull()
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
  })
})

describe('addAgentToProject @SC-020', () => {
  // SC-020 / SC-162 — add + remove agents as members; adding twice is
  // idempotent (upsert, no duplicate ProjectAgent row).
  it('adds an agent and removing it deletes the membership', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()

    await addAgentToProject({ projectId: project.id, agentId: agent.id })
    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(1)

    await removeAgentFromProject({ projectId: project.id, agentId: agent.id, openTasksTo: null, newDefaultAgentId: null })
    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(0)
  })

  it('is idempotent — adding an already-member agent creates no duplicate', async () => {
    const project = await createProjectRow()
    const agent = await createAgentRow()

    await addAgentToProject({ projectId: project.id, agentId: agent.id })
    await addAgentToProject({ projectId: project.id, agentId: agent.id })

    expect(await prisma.projectAgent.count({ where: { projectId: project.id } })).toBe(1)
  })
})

