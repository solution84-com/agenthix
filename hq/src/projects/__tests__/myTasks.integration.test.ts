/**
 * Your tasks (every screen reviewed spec §3): the tasks done on the caller's behalf in every project they may see,
 * the last 30 days of finished work, and nothing from a private project they are not in. Written, not run here:
 * the lead runs the integration suite.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'
import { ctx, makeTask } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { getMyTasks } from '../myTasksQueries'
import { getTaskComments } from '../queries'

const DAY = 24 * 60 * 60 * 1000

describe('getMyTasks @SC-517', () => {
  it('returns the tasks done on the caller\'s behalf across projects, with each task\'s project', async () => {
    const me = await createUser()
    const other = await createUser()
    const a = await createProject()
    const b = await createProject()
    await prisma.projectMember.createMany({ data: [a, b].map(p => ({ projectId: p.id, userId: me.id })) })
    const mineA = await makeTask(a.id, { onBehalfOfUserId: me.id })
    const mineB = await makeTask(b.id, { onBehalfOfUserId: me.id })
    await makeTask(a.id, { onBehalfOfUserId: other.id })

    const rows = await getMyTasks(undefined, ctx(me))
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual([mineA.id, mineB.id].sort())
    expect(rows.find((r: { id: string }) => r.id === mineA.id)!.project).toMatchObject({ id: a.id, key: a.key })
  })

  it('leaves out archived tasks and tasks of a private project the caller is not in', async () => {
    const me = await createUser()
    const open = await createProject()
    const closed = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.createMany({ data: [open].map(p => ({ projectId: p.id, userId: me.id })) })
    const kept = await makeTask(open.id, { onBehalfOfUserId: me.id })
    await makeTask(open.id, { onBehalfOfUserId: me.id, archived: true })
    await makeTask(closed.id, { onBehalfOfUserId: me.id })

    expect((await getMyTasks(undefined, ctx(me))).map((r: { id: string }) => r.id)).toEqual([kept.id])
  })

  it('keeps finished work only for the last 30 days', async () => {
    const me = await createUser()
    const p = await createProject()
    await prisma.projectMember.createMany({ data: [p].map(p => ({ projectId: p.id, userId: me.id })) })
    const recent = await makeTask(p.id, { onBehalfOfUserId: me.id, status: 'DONE', doneAt: new Date(Date.now() - 3 * DAY) })
    await makeTask(p.id, { onBehalfOfUserId: me.id, status: 'DONE', doneAt: new Date(Date.now() - 45 * DAY) })
    const open = await makeTask(p.id, { onBehalfOfUserId: me.id })

    expect((await getMyTasks(undefined, ctx(me))).map((r: { id: string }) => r.id).sort()).toEqual([recent.id, open.id].sort())
  })

  it('rejects a caller who is not signed in with 401', async () => {
    await expect(Promise.resolve(getMyTasks(undefined, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('getTaskComments names who wrote a comment @SC-515', () => {
  it('says "You" for the reader\'s own and the username for another person\'s', async () => {
    const me = await createUser()
    const other = await createUser()
    const p = await createProject()
    await prisma.projectMember.createMany({ data: [p].map(p => ({ projectId: p.id, userId: me.id })) })
    const task = await makeTask(p.id, { onBehalfOfUserId: me.id })
    await prisma.taskComment.create({ data: { taskId: task.id, authorType: 'USER', userId: me.id, content: 'mine' } })
    await prisma.taskComment.create({ data: { taskId: task.id, authorType: 'USER', userId: other.id, content: 'theirs' } })

    const rows = await getTaskComments({ taskId: task.id }, ctx(me))
    expect(rows.find((r: { content: string }) => r.content === 'mine')!.userName).toBe('You')
    expect(rows.find((r: { content: string }) => r.content === 'theirs')!.userName).not.toBe('You')
    expect(rows.find((r: { content: string }) => r.content === 'theirs')!.userName).toBeTruthy()
  })
})
