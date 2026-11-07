/**
 * The task lists against the database (T7): a project's Tasks and Your tasks, with their scorecard counts, filters,
 * order and paging, and who may read them. Written, not run here: the lead runs the integration suite.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser } from '../../../test/factories'
import { ctx, makeBoard, makeTask } from '../../__tests__/projectsHarness'
import { MANIFEST_BLOCKED_REASON } from '../../../agents/taskExecutionReasons'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../server/dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))

import { getMyTaskList, getTaskList } from '../taskListQuery'

const DAY = 24 * 60 * 60 * 1000

async function projectWithMember() {
  const me = await createUser()
  const sam = await createUser({ displayName: 'Sam Okafor' })
  const project = await createProject()
  await prisma.projectMember.createMany({ data: [me, sam].map(u => ({ projectId: project.id, userId: u.id })) })
  const board = await prisma.board.findFirstOrThrow({ where: { projectId: project.id } }).catch(() => makeBoard(project.id))
  return { me, sam, project, board }
}

describe('a project’s Tasks @SC-513', () => {
  it('answers every open task, the last 30 days of done ones, with the scorecard counts', async () => {
    const { me, sam, project, board } = await projectWithMember()
    const agent = await createAgent()
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, assignedAgentId: agent.id, runState: 'RUN_BLOCKED', runStateReason: MANIFEST_BLOCKED_REASON })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: sam.id, assignedAgentId: agent.id, runState: 'RUN_BLOCKED', runStateReason: MANIFEST_BLOCKED_REASON })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: sam.id, assignedAgentId: agent.id, runState: 'RUN_FAILED', runStateReason: 'model overloaded' })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, status: 'DONE', doneAt: new Date(Date.now() - 3 * DAY) })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, status: 'DONE', doneAt: new Date(Date.now() - 45 * DAY) })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, archived: true })

    const page = await getTaskList({ projectId: project.id }, ctx(me))
    expect(page.rows).toHaveLength(6)
    expect(page.counts).toMatchObject({
      all: 6, needsYou: { count: 2, okay: 1, failed: 1 }, running: { count: 1 }, waiting: { count: 1 },
      notStarted: { count: 1 }, done: { count: 1 },
    })
    expect(page.counts.waitingOn).toEqual([{ name: 'Sam Okafor', count: 1 }])
    // Importance: the reader's okay, then the failure, running, waiting on Sam, not started, done.
    expect(page.rows.map(r => r.waitsOn?.who ?? null)[0]).toBe('you')
    expect(page.rows[3].waitsOn).toEqual({ what: 'okay', who: { name: 'Sam Okafor' } })
  })

  it('narrows to the chosen scorecard, keeps the counts, and pages', async () => {
    const { me, project, board } = await projectWithMember()
    for (let i = 0; i < 3; i++) await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, runState: 'RUN_QUEUED', assignedAgentId: (await createAgent()).id })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id })

    const page = await getTaskList({ projectId: project.id, card: 'waiting', limit: 2 }, ctx(me))
    expect(page.rows).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.counts.all).toBe(4)
    expect(page.counts.notStarted.count).toBe(1)
  })

  it('draws an epic as a row with its progress and its milestone’s date, and filters by it', async () => {
    const { me, project, board } = await projectWithMember()
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Launch', date: new Date('2026-11-20') } })
    const epic = await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, isEpic: true, milestoneId: milestone.id, title: 'Launch pages' })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, epicId: epic.id, status: 'DONE', doneAt: new Date() })
    const open = await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, epicId: epic.id })

    const all = await getTaskList({ projectId: project.id }, ctx(me))
    const epicRow = all.rows.find(r => r.id === epic.id)!
    expect(epicRow.isEpic).toBe(true)
    expect(epicRow.progress).toEqual({ done: 1, total: 2, needsYou: 0 })
    expect(epicRow.epicDate).toMatchObject({ milestone: 'Launch' })
    expect(all.rows.find(r => r.id === open.id)!.epic).toEqual({ id: epic.id, title: 'Launch pages' })
    expect(all.options.epics).toEqual([{ id: epic.id, name: 'Launch pages' }])

    const onlyEpics = await getTaskList({ projectId: project.id, type: 'epic', sort: 'planDate' }, ctx(me))
    expect(onlyEpics.rows.map(r => r.id)).toEqual([epic.id])
    const itsTasks = await getTaskList({ projectId: project.id, epicId: epic.id }, ctx(me))
    expect(itsTasks.rows.map(r => r.id).sort()).not.toContain(epic.id)
  })

  it('names the board only when the project has more than one, and the column, Backlog when none', async () => {
    const { me, project, board } = await projectWithMember()
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, column: null })
    let page = await getTaskList({ projectId: project.id }, ctx(me))
    expect(page.rows[0]).toMatchObject({ columnLabel: null, showBoard: false })
    await makeBoard(project.id, { name: 'Second' })
    page = await getTaskList({ projectId: project.id }, ctx(me))
    expect(page.rows[0].showBoard).toBe(true)
  })

  it('shows only archived tasks with Archived', async () => {
    const { me, project, board } = await projectWithMember()
    const archived = await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, archived: true })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id })
    const page = await getTaskList({ projectId: project.id, archived: true }, ctx(me))
    expect(page.rows.map(r => r.id)).toEqual([archived.id])
  })

  it('answers someone not on a private project as if it did not exist, and refuses an argument it cannot read', async () => {
    const outsider = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await expect(Promise.resolve(getTaskList({ projectId: project.id }, ctx(outsider)))).rejects.toMatchObject({ statusCode: 404 })
    const { me, project: mine } = await projectWithMember()
    await expect(Promise.resolve(getTaskList({ projectId: mine.id, card: 'all' as never }, ctx(me)))).rejects.toMatchObject({ statusCode: 400 })
    await expect(Promise.resolve(getTaskList({ projectId: mine.id }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('Your tasks @SC-517', () => {
  it('holds the tasks on the reader’s behalf that need them or run for them, in every project they may see', async () => {
    const { me, sam, project, board } = await projectWithMember()
    const other = await createProject()
    await prisma.projectMember.create({ data: { projectId: other.id, userId: me.id } })
    const agent = await createAgent()
    const failed = await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, assignedAgentId: agent.id, runState: 'RUN_FAILED' })
    const running = await makeTask(other.id, { onBehalfOfUserId: me.id, assignedAgentId: agent.id, runState: 'RUN_ACTIVE' })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id }) // never run
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: me.id, isEpic: true })
    await makeTask(project.id, { boardId: board.id, onBehalfOfUserId: sam.id, runState: 'RUN_FAILED' })
    const privateOne = await createProject({ accessLevel: 'PRIVATE' })
    await makeTask(privateOne.id, { onBehalfOfUserId: me.id, runState: 'RUN_FAILED' })

    const page = await getMyTaskList({}, ctx(me))
    expect(page.rows.map(r => r.id).sort()).toEqual([failed.id, running.id].sort())
    expect(page.counts).toMatchObject({ all: 2, needsYou: { count: 1 }, running: { count: 1 } })
    expect(page.options.projects.map(p => p.id).sort()).toEqual([project.id, other.id].sort())

    const inOne = await getMyTaskList({ projectId: other.id }, ctx(me))
    expect(inOne.rows.map(r => r.id)).toEqual([running.id])
  })
})
