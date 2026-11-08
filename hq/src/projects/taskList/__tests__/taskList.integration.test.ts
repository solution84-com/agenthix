/**
 * The task lists against the database (T1–T5, Y1): a project's Tasks and Your tasks, with their scorecard counts by
 * task state, filters, order and paging, and who may read them. Written, not run here: the lead runs the integration
 * suite.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createUser } from '../../../test/factories'
import { ctx, makeTask } from '../../__tests__/projectsHarness'

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
const TODAY = '2026-11-07'

async function projectWithMember() {
  const me = await createUser()
  const sam = await createUser({ displayName: 'Sam Okafor' })
  const project = await createProject()
  await prisma.projectMember.createMany({ data: [me, sam].map(u => ({ projectId: project.id, userId: u.id })) })
  return { me, sam, project }
}

describe('a project’s Tasks @SC-513', () => {
  it('counts by task state, Late and No agent, never by run, over the open tasks and 30 days of done ones', async () => {
    const { me, project } = await projectWithMember()
    const agent = await createAgent()
    const on = { onBehalfOfUserId: me.id }
    await makeTask(project.id, { ...on, state: 'BACKLOG' })
    await makeTask(project.id, { ...on, state: 'TODO', assignedAgentId: agent.id, planFinish: new Date('2026-11-01') })
    await makeTask(project.id, { ...on, state: 'IN_PROGRESS', assignedAgentId: agent.id, runState: 'RUN_ACTIVE', executionState: 'RUNNING' })
    await makeTask(project.id, { ...on, state: 'DONE', doneAt: new Date(Date.now() - 3 * DAY), planFinish: new Date('2026-11-01') })
    await makeTask(project.id, { ...on, state: 'DONE', doneAt: new Date(Date.now() - 45 * DAY) })
    await makeTask(project.id, { ...on, archived: true })

    const page = await getTaskList({ projectId: project.id, today: TODAY }, ctx(me))
    expect(page.rows).toHaveLength(4)
    // A done task past its date is not late, and needs no agent.
    expect(page.counts).toEqual({ all: 4, backlog: 1, todo: 1, inProgress: 1, done: 1, late: 1, noAgent: 1 })
    expect(page.rows.find(r => r.state === 'IN_PROGRESS')!.executionState).toBe('RUNNING')
  })

  it('narrows to the chosen card, keeps the counts, and pages', async () => {
    const { me, project } = await projectWithMember()
    for (let i = 0; i < 3; i++) await makeTask(project.id, { onBehalfOfUserId: me.id, state: 'TODO' })
    await makeTask(project.id, { onBehalfOfUserId: me.id, state: 'BACKLOG' })

    const page = await getTaskList({ projectId: project.id, card: 'todo', limit: 2 }, ctx(me))
    expect(page.rows).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.counts.all).toBe(4)
    expect(page.counts.backlog).toBe(1)
  })

  it('sorts by the project’s rank by default, unplaced tasks last', async () => {
    const { me, project } = await projectWithMember()
    const c = await makeTask(project.id, { onBehalfOfUserId: me.id, rank: 'c' })
    const a = await makeTask(project.id, { onBehalfOfUserId: me.id, rank: 'a' })
    const none = await makeTask(project.id, { onBehalfOfUserId: me.id, rank: null })
    const page = await getTaskList({ projectId: project.id }, ctx(me))
    expect(page.rows.map(r => r.id)).toEqual([a.id, c.id, none.id])
  })

  it('draws an epic as a line with its tasks by state and its milestone’s date, and filters by type name', async () => {
    const { me, project } = await projectWithMember()
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Launch', date: new Date('2026-11-20') } })
    const epic = await makeTask(project.id, { onBehalfOfUserId: me.id, epic: true, milestoneId: milestone.id, title: 'Launch pages' })
    await makeTask(project.id, { onBehalfOfUserId: me.id, epicId: epic.id, state: 'DONE', doneAt: new Date() })
    const open = await makeTask(project.id, { onBehalfOfUserId: me.id, epicId: epic.id, state: 'TODO' })

    const all = await getTaskList({ projectId: project.id }, ctx(me))
    const epicRow = all.rows.find(r => r.id === epic.id)!
    expect(epicRow).toMatchObject({ type: { name: 'Epic', kind: 'EPIC' }, due: '2026-11-20' })
    expect(epicRow.progress).toEqual({ done: 1, total: 2, backlog: 0, todo: 1, inProgress: 0 })
    expect(all.rows.find(r => r.id === open.id)!.epic).toEqual({ id: epic.id, title: 'Launch pages' })
    expect(all.options.epics).toEqual([{ id: epic.id, name: 'Launch pages' }])
    expect(all.options.types.map(t => t.name)).toEqual(['Epic', 'Task'])

    const onlyEpics = await getTaskList({ projectId: project.id, type: 'Epic', sort: 'due' }, ctx(me))
    expect(onlyEpics.rows.map(r => r.id)).toEqual([epic.id])
  })

  it('names a task’s column and its value in each custom field, and filters by an option', async () => {
    const { me, project } = await projectWithMember()
    const type = await prisma.taskType.create({ data: { projectId: project.id, name: 'Bug', icon: 'bug', kind: 'CUSTOM' } })
    const column = await prisma.typeColumn.create({ data: { typeId: type.id, name: 'Reported', order: 0, state: 'BACKLOG', defaultForState: true } })
    const field = await prisma.customField.create({ data: { projectId: project.id, name: 'Launch stage' } })
    const copy = await prisma.fieldOption.create({ data: { fieldId: field.id, name: 'Copy', order: 0 } })
    const bug = await makeTask(project.id, { onBehalfOfUserId: me.id, typeId: type.id, columnId: column.id, state: 'BACKLOG' })
    await makeTask(project.id, { onBehalfOfUserId: me.id })
    await prisma.taskFieldValue.create({ data: { taskId: bug.id, fieldId: field.id, optionId: copy.id } })

    const page = await getTaskList({ projectId: project.id }, ctx(me))
    expect(page.rows.find(r => r.id === bug.id)).toMatchObject({
      type: { name: 'Bug', icon: 'bug' }, column: { id: column.id, name: 'Reported' }, fields: { [field.id]: { optionId: copy.id, name: 'Copy' } },
    })
    expect(page.options.fields).toEqual([{ id: field.id, name: 'Launch stage', options: [{ id: copy.id, name: 'Copy' }] }])
    const narrowed = await getTaskList({ projectId: project.id, optionId: copy.id }, ctx(me))
    expect(narrowed.rows.map(r => r.id)).toEqual([bug.id])
    const byColumn = await getTaskList({ projectId: project.id, column: 'Reported' }, ctx(me))
    expect(byColumn.rows.map(r => r.id)).toEqual([bug.id])
  })

  it('shows only archived tasks with Archived', async () => {
    const { me, project } = await projectWithMember()
    const archived = await makeTask(project.id, { onBehalfOfUserId: me.id, archived: true })
    await makeTask(project.id, { onBehalfOfUserId: me.id })
    const page = await getTaskList({ projectId: project.id, archived: true }, ctx(me))
    expect(page.rows.map(r => r.id)).toEqual([archived.id])
  })

  it('answers someone not on a private project as if it did not exist, and refuses an argument it cannot read', async () => {
    const outsider = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await expect(Promise.resolve(getTaskList({ projectId: project.id }, ctx(outsider)))).rejects.toMatchObject({ statusCode: 404 })
    const { me, project: mine } = await projectWithMember()
    await expect(Promise.resolve(getTaskList({ projectId: mine.id, card: 'needsYou' as never }, ctx(me)))).rejects.toMatchObject({ statusCode: 400 })
    await expect(Promise.resolve(getTaskList({ projectId: mine.id }, ctx(null)))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('Your tasks @SC-517', () => {
  it('holds the tasks whose For is the reader, in every project they may see, by due date, epics aside', async () => {
    const { me, sam, project } = await projectWithMember()
    const other = await createProject()
    await prisma.projectMember.create({ data: { projectId: other.id, userId: me.id } })
    const later = await makeTask(project.id, { onBehalfOfUserId: me.id, planFinish: new Date('2026-11-20') })
    const sooner = await makeTask(other.id, { onBehalfOfUserId: me.id, planFinish: new Date('2026-11-10') })
    const undated = await makeTask(project.id, { onBehalfOfUserId: me.id })
    await makeTask(project.id, { onBehalfOfUserId: me.id, epic: true })
    await makeTask(project.id, { onBehalfOfUserId: sam.id })
    const privateOne = await createProject({ accessLevel: 'PRIVATE' })
    await makeTask(privateOne.id, { onBehalfOfUserId: me.id })

    const page = await getMyTaskList({ today: TODAY }, ctx(me))
    expect(page.rows.map(r => r.id)).toEqual([sooner.id, later.id, undated.id])
    expect(page.counts.all).toBe(3)
    expect(page.options.projects.map(p => p.id).sort()).toEqual([project.id, other.id].sort())

    const inOne = await getMyTaskList({ projectId: other.id }, ctx(me))
    expect(inOne.rows.map(r => r.id)).toEqual([sooner.id])
  })
})
