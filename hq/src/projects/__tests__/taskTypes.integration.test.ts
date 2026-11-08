/**
 * Every project's own task types (adr-0174), against the real test DB: a project is made with Task and Epic, each
 * with the four state columns; a project without them (a fixture row) gets them when they are first asked for, once,
 * even when two callers ask at the same moment; and its tasks are left as they are. Written by lane p1 of the tasks,
 * runs, boards and routines unit; run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, ensureExecutionSite, createProject as projectRow } from '../../test/factories'

const site = vi.hoisted(() => ({ seedFilesOnSite: vi.fn(), ensureDirOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...site,
}))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createProject } from '../projectService'
import { ensurePersonalProject } from '../personalProject'
import { ensureBuiltInTaskTypes } from '../taskTypes'

const typesOf = (projectId: string) => prisma.taskType.findMany({
  where: { projectId },
  orderBy: { order: 'asc' },
  include: { columns: { orderBy: { order: 'asc' } } },
})

const FOUR = [
  ['Backlog', 'BACKLOG', true], ['To do', 'TODO', true], ['In progress', 'IN_PROGRESS', true], ['Done', 'DONE', true],
]

describe('every project has Task and Epic', () => {
  it('a project a person makes is made with them, each with the four state columns', async () => {
    const admin = await createUserWithRole('ADMIN')
    const s = await ensureExecutionSite()
    const project = await createProject({ name: `Proj ${Math.random()}`, executionSiteId: s.id, createdByUserId: admin.id })
    const types = await typesOf(project.id)
    expect(types.map(t => [t.name, t.kind, t.archivedAt])).toEqual([['Task', 'TASK', null], ['Epic', 'EPIC', null]])
    for (const t of types) expect(t.columns.map(c => [c.name, c.state, c.defaultForState])).toEqual(FOUR)
  })

  it("a person's space is made with them", async () => {
    const owner = await createUser()
    const personal = await ensurePersonalProject(owner.id)
    expect((await typesOf(personal.id)).map(t => t.kind)).toEqual(['TASK', 'EPIC'])
  })

  it('a project without them gets them when first asked, and the same ones after', async () => {
    const project = await projectRow()
    expect(await typesOf(project.id)).toEqual([])
    const first = await ensureBuiltInTaskTypes(project.id)
    const again = await ensureBuiltInTaskTypes(project.id)
    expect(again).toEqual(first)
    expect((await typesOf(project.id)).map(t => t.kind)).toEqual(['TASK', 'EPIC'])
  })

  it('two callers at once make one of each', async () => {
    const project = await projectRow()
    const [a, b] = await Promise.all([ensureBuiltInTaskTypes(project.id), ensureBuiltInTaskTypes(project.id)])
    expect(a).toEqual(b)
    expect(await prisma.taskType.count({ where: { projectId: project.id } })).toBe(2)
    expect(await prisma.typeColumn.count({ where: { type: { projectId: project.id } } })).toBe(8)
  })

  it('a project missing only Epic gets Epic, and keeps its Task', async () => {
    const project = await projectRow()
    const { TASK } = await ensureBuiltInTaskTypes(project.id)
    await prisma.taskType.delete({ where: { id: (await prisma.taskType.findFirstOrThrow({ where: { projectId: project.id, kind: 'EPIC' } })).id } })
    const after = await ensureBuiltInTaskTypes(project.id)
    expect(after.TASK).toBe(TASK)
    expect((await typesOf(project.id)).map(t => t.kind).sort()).toEqual(['EPIC', 'TASK'])
  })
})
