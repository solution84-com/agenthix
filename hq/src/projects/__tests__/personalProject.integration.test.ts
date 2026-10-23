/**
 * A person's own personal project (agents own schedule spec §4), against the
 * real test DB: made once per person, private, with them as its one member and
 * admin, a board with the default columns, and no site of its own; never joined
 * to another project's board; and its tasks run in its person's storage. Several
 * personal projects per person are in personalProjects.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { makeBoard, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import {
  ensurePersonalProject, ensurePersonalProjectsForEveryone, refuseOnPersonalProject, refuseBoardAcrossPersonalEdge, taskRunOwner,
  PERSONAL_PROJECT_NAME,
} from '../personalProject'
import { DEFAULT_BOARD_COLUMNS } from '../boardColumns'
import { getMyPersonalProject } from '../personalProjectQueries'

const uniqueViolation = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })

describe('ensurePersonalProject @SC-1210', () => {
  it('creates it private, owned by the person, with them as its one member and admin, its Project Tasks, and no site', async () => {
    const owner = await createUser()

    const created = await ensurePersonalProject(owner.id)

    const row = await prisma.project.findUniqueOrThrow({ where: { id: created.id }, include: { members: true, boards: true } })
    expect(row).toMatchObject({ name: PERSONAL_PROJECT_NAME, accessLevel: 'PRIVATE', personalOwnerId: owner.id, personalSpace: true, executionSiteId: null })
    expect(row.key).toMatch(/^[A-Z]{2,6}$/)
    expect(row.members).toEqual([expect.objectContaining({ userId: owner.id, role: 'ADMIN' })])
    expect(row.boards).toHaveLength(1)
    expect(row.boards[0]).toMatchObject({ name: 'Project Tasks', kind: 'PROJECT_TASKS', columns: DEFAULT_BOARD_COLUMNS })
  })

  it('returns the existing one and creates nothing, however often it is asked — concurrently too', async () => {
    const owner = await createUser()
    const [a, b] = await Promise.all([ensurePersonalProject(owner.id), ensurePersonalProject(owner.id)])
    const c = await ensurePersonalProject(owner.id)
    expect(new Set([a.id, b.id, c.id]).size).toBe(1)
    expect(await prisma.project.count({ where: { personalOwnerId: owner.id } })).toBe(1)
  })

  it("finds the space by its mark, whatever other personal projects the person has", async () => {
    const owner = await createUser()
    await createProject({ personalOwnerId: owner.id, personalSpace: false })
    const space = await ensurePersonalProject(owner.id)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: space.id } })).personalSpace).toBe(true)
    expect((await ensurePersonalProject(owner.id)).id).toBe(space.id)
    expect(await prisma.project.count({ where: { personalOwnerId: owner.id } })).toBe(2)
  })

  it('tries another key when the one it picked is taken', async () => {
    const owner = await createUser()
    const create = vi.spyOn(prisma.project, 'create').mockRejectedValueOnce(uniqueViolation())
    expect((await ensurePersonalProject(owner.id)).id).toBeTruthy()
    expect(create).toHaveBeenCalledTimes(2)
    create.mockRestore()
  })

  it('lets any other failure through', async () => {
    const owner = await createUser()
    const create = vi.spyOn(prisma.project, 'create').mockRejectedValueOnce(new Error('database down'))
    await expect(ensurePersonalProject(owner.id)).rejects.toThrow('database down')
    create.mockRestore()
  })
})

describe('ensurePersonalProjectsForEveryone @SC-1210', () => {
  it('makes one for every account that has none, and one failure does not stop the rest', async () => {
    const first = await createUser()
    const second = await createUser()
    const already = await createUser()
    await ensurePersonalProject(already.id)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const create = vi.spyOn(prisma.project, 'create').mockRejectedValueOnce(new Error('boom'))

    await ensurePersonalProjectsForEveryone()
    create.mockRestore()

    const owners = (await prisma.project.findMany({ where: { personalOwnerId: { not: null } } })).map((p) => p.personalOwnerId)
    expect(owners).toContain(already.id)
    expect(owners.filter((id) => id === first.id || id === second.id)).toHaveLength(1)
    expect(owners.filter((id) => id === already.id)).toHaveLength(1)
  })
})

describe('getMyPersonalProject @SC-1210', () => {
  it("answers the caller's own personal project, creating it if it is missing, and refuses anyone signed out", async () => {
    const owner = await createUser()
    const mine = await getMyPersonalProject(undefined, { user: { id: owner.id } } as any)
    expect((await prisma.project.findUniqueOrThrow({ where: { id: mine.id } })).personalOwnerId).toBe(owner.id)
    await expect(getMyPersonalProject(undefined, { user: undefined } as any)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('what a personal project refuses @SC-1210', () => {
  it('refuses an act on it with 400 naming the act, and lets any other project — or a missing one — through', async () => {
    const mine = await ensurePersonalProject((await createUser()).id)
    const shared = await createProject()
    await expect(refuseOnPersonalProject(mine.id, 'Deleting')).rejects.toMatchObject({
      statusCode: 400, message: 'Deleting is not possible for a personal project',
    })
    await expect(refuseOnPersonalProject(shared.id, 'Deleting')).resolves.toBeUndefined()
    await expect(refuseOnPersonalProject('gone', 'Deleting')).resolves.toBeUndefined()
  })

  it("refuses a personal project's task onto another project's board and the other way round, and allows the rest", async () => {
    const mine = await ensurePersonalProject((await createUser()).id)
    const myBoard = await prisma.board.findFirstOrThrow({ where: { projectId: mine.id } })
    const shared = await createProject()
    const sharedBoard = await makeBoard(shared.id)
    const other = await createProject()
    const otherBoard = await makeBoard(other.id)

    await expect(refuseBoardAcrossPersonalEdge(mine.id, sharedBoard.id)).rejects.toMatchObject({ statusCode: 400 })
    await expect(refuseBoardAcrossPersonalEdge(shared.id, myBoard.id)).rejects.toMatchObject({ statusCode: 400 })
    await expect(refuseBoardAcrossPersonalEdge(mine.id, myBoard.id)).resolves.toBeUndefined()
    await expect(refuseBoardAcrossPersonalEdge(shared.id, otherBoard.id)).resolves.toBeUndefined()
  })
})

describe('taskRunOwner — where a task runs, and so whose run it is @SC-1210', () => {
  it("a task in Your space runs as its person in their own storage, one in another personal project as them in the project's own, any other as its project, and a gone task as none", async () => {
    const owner = await createUser()
    const mine = await ensurePersonalProject(owner.id)
    const side = await createProject({ personalOwnerId: owner.id })
    const shared = await createProject()
    const spaceTask = await makeTask(mine.id)
    const sideTask = await makeTask(side.id)
    const sharedTask = await makeTask(shared.id)

    expect(await taskRunOwner(spaceTask.id)).toEqual({
      projectId: mine.id, ownerType: 'user', ownerId: owner.id, storage: { ownerType: 'user', ownerId: owner.id },
    })
    expect(await taskRunOwner(sideTask.id)).toEqual({
      projectId: side.id, ownerType: 'user', ownerId: owner.id, storage: { ownerType: 'project', ownerId: side.id },
    })
    expect(await taskRunOwner(sharedTask.id)).toEqual({
      projectId: shared.id, ownerType: 'project', ownerId: shared.id, storage: { ownerType: 'project', ownerId: shared.id },
    })
    expect(await taskRunOwner('gone')).toBeNull()
  })
})
