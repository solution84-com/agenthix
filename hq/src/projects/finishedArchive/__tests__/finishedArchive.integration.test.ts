/**
 * Archiving finished tasks, against the real test DB: when a task finished
 * (`doneAt`), the org's and each project's choice of how long to keep it on the
 * board, and the sweep that archives what has waited long enough.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser, createUserWithRole } from '../../../test/factories'
import { makeBoard, makeTask } from '../../__tests__/projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../server/dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { getOrgArchiveSetting, updateOrgArchiveSetting, getProjectArchiveSetting, setProjectArchiveSetting } from '../archiveActions'
import { sweepFinishedTasks } from '../archiveSweep'
import { moveTaskToColumn, returnTaskToBacklog, updateTask } from '../../taskService'

const as = (user: { id: string }) => ({ user })
const DAY = 86_400_000
const NOW = new Date('2026-10-10T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY - 60_000)
const orgDays = async () => (await prisma.org.findFirst())?.archiveFinishedAfterDays

describe('the org setting', () => {
  it('reads as 1 day out of the box', async () => {
    expect(await getOrgArchiveSetting(undefined, as(await createUser()))).toEqual({ days: 1 })
  })

  it('needs an org admin, and stores off as null', async () => {
    const operator = await createUserWithRole('MEMBER')
    await expect(updateOrgArchiveSetting({ days: 7 }, as(operator))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.org.count()).toBe(0)

    const admin = await createUserWithRole('ADMIN')
    await updateOrgArchiveSetting({ days: 7 }, as(admin))
    expect(await orgDays()).toBe(7)
    await updateOrgArchiveSetting({ days: 0 }, as(admin))
    expect(await orgDays()).toBeNull()
    expect(await getOrgArchiveSetting(undefined, as(admin))).toEqual({ days: 0 })
  })

  it('answers a value that is not a choice with a 400', async () => {
    const admin = await createUserWithRole('ADMIN')
    await expect(updateOrgArchiveSetting({ days: 3 as never }, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.org.count()).toBe(0)
  })
})

describe('a project setting', () => {
  async function projectAndAdmin() {
    const admin = await createUser()
    const project = await createProject()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: admin.id, role: 'ADMIN' } })
    return { admin, project }
  }

  it("needs the project's admin", async () => {
    const { project } = await projectAndAdmin()
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    await expect(setProjectArchiveSetting({ projectId: project.id, days: 7 }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).archiveFinishedAfterDays).toBeNull()
  })

  it("stands whatever the org has, off included, and null returns it to the org's default", async () => {
    const { admin, project } = await projectAndAdmin()
    await prisma.org.create({ data: { name: 'Org', archiveFinishedAfterDays: 1 } })

    expect(await setProjectArchiveSetting({ projectId: project.id, days: 0 }, as(admin))).toEqual({ own: 0, org: 1 })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).archiveFinishedAfterDays).toBe(0)
    await setProjectArchiveSetting({ projectId: project.id, days: null }, as(admin))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).archiveFinishedAfterDays).toBeNull()
  })

  it("reads its own choice beside the org's, for a member", async () => {
    const { admin, project } = await projectAndAdmin()
    await setProjectArchiveSetting({ projectId: project.id, days: 30 }, as(admin))
    expect(await getProjectArchiveSetting({ projectId: project.id }, as(admin))).toEqual({ own: 30, org: 1 })
  })
})

describe('sweepFinishedTasks', () => {
  async function finished(projectData: Record<string, unknown>, taskData: Record<string, unknown>) {
    const project = await createProject(projectData)
    return makeTask(project.id, { status: 'DONE', ...taskData })
  }
  const archived = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).archived

  it('archives finished, idle, unarchived tasks past their setting, and counts them', async () => {
    const old = await finished({}, { doneAt: daysAgo(2) })
    const recent = await finished({}, { doneAt: new Date(NOW.getTime() - 60_000) })
    const running = await finished({}, { doneAt: daysAgo(2), runState: 'RUN_ACTIVE' })
    const notDone = await finished({}, { status: 'TODO', doneAt: daysAgo(2) })

    expect(await sweepFinishedTasks(NOW)).toBe(1)

    expect([await archived(old.id), await archived(recent.id), await archived(running.id), await archived(notDone.id)])
      .toEqual([true, false, false, false])
  })

  it("applies a project's own choice, and the org's only to projects with none", async () => {
    await prisma.org.create({ data: { name: 'Org', archiveFinishedAfterDays: 7 } })
    const weekOld = await finished({}, { doneAt: daysAgo(8) })
    const dayOldOnDefault = await finished({}, { doneAt: daysAgo(2) })
    const dayOldOnOne = await finished({ archiveFinishedAfterDays: 1 }, { doneAt: daysAgo(2) })
    const monthChoice = await finished({ archiveFinishedAfterDays: 30 }, { doneAt: daysAgo(8) })

    await sweepFinishedTasks(NOW)

    expect([await archived(weekOld.id), await archived(dayOldOnDefault.id), await archived(dayOldOnOne.id), await archived(monthChoice.id)])
      .toEqual([true, false, true, false])
  })

  it('leaves projects with no choice alone when the org has it off, and a project that chose off alone', async () => {
    await prisma.org.create({ data: { name: 'Org', archiveFinishedAfterDays: null } })
    const onDefault = await finished({}, { doneAt: daysAgo(40) })
    const off = await finished({ archiveFinishedAfterDays: 0 }, { doneAt: daysAgo(40) })
    expect(await sweepFinishedTasks(NOW)).toBe(0)
    expect([await archived(onDefault.id), await archived(off.id)]).toEqual([false, false])
  })

  it('defaults to one day before an org row exists', async () => {
    const t = await finished({}, { doneAt: daysAgo(2) })
    await sweepFinishedTasks(NOW)
    expect(await archived(t.id)).toBe(true)
  })

  it('keeps going when one task fails to archive', async () => {
    const a = await finished({}, { doneAt: daysAgo(2) })
    const b = await finished({}, { doneAt: daysAgo(3) })
    const update = vi.spyOn(prisma.task, 'update').mockRejectedValueOnce(new Error('gone'))
    expect(await sweepFinishedTasks(NOW)).toBe(1)
    update.mockRestore()
    expect([await archived(a.id), await archived(b.id)].filter(Boolean)).toHaveLength(1)
  })
})

// `doneAt` is when a task entered a done column.
describe('doneAt', () => {
  const COLUMNS = [
    { name: 'todo', label: 'To do', status: 'TODO', order: 0, color: 'x' },
    { name: 'done', label: 'Done', status: 'DONE', order: 1, color: 'x' },
    { name: 'shipped', label: 'Shipped', status: 'DONE', order: 2, color: 'x' },
  ]
  const EARLIER = new Date('2026-09-01T00:00:00Z')
  async function onBoard(data: Record<string, unknown>) {
    const project = await createProject()
    const board = await makeBoard(project.id, { columns: COLUMNS })
    return makeTask(project.id, { boardId: board.id, ...data })
  }
  const doneAt = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).doneAt

  it('is set when a task moves into a done column, kept between done columns, and cleared on the way out', async () => {
    const t = await onBoard({ column: 'todo' })
    await moveTaskToColumn({ taskId: t.id, column: 'done' })
    const first = await doneAt(t.id)
    expect(first).toBeInstanceOf(Date)
    await moveTaskToColumn({ taskId: t.id, column: 'shipped' })
    expect(await doneAt(t.id)).toEqual(first)
    await moveTaskToColumn({ taskId: t.id, column: 'todo' })
    expect(await doneAt(t.id)).toBeNull()
  })

  it('is kept from before when a task already done moves between done columns', async () => {
    const t = await onBoard({ column: 'done', status: 'DONE', doneAt: EARLIER })
    await moveTaskToColumn({ taskId: t.id, column: 'shipped' })
    expect(await doneAt(t.id)).toEqual(EARLIER)
  })

  it('is cleared when it returns to the backlog', async () => {
    const t = await onBoard({ column: 'done', status: 'DONE', doneAt: EARLIER })
    await returnTaskToBacklog({ taskId: t.id })
    expect(await doneAt(t.id)).toBeNull()
  })

  it('follows a status edit, so a backlog task set to DONE counts too, and is left alone by any other edit', async () => {
    const project = await createProject()
    const t = await makeTask(project.id)
    await updateTask({ taskId: t.id, status: 'DONE' })
    const set = await doneAt(t.id)
    expect(set).toBeInstanceOf(Date)
    await updateTask({ taskId: t.id, title: 'New title' })
    expect(await doneAt(t.id)).toEqual(set)
    await updateTask({ taskId: t.id, status: 'TODO' })
    expect(await doneAt(t.id)).toBeNull()
  })
})
