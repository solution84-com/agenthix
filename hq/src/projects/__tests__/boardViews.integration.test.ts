/**
 * What the deprecated board reads and the Timeline tool answer, against the real test DB. A task is on no board
 * (adr-0176): the mobile app's board reads answer from saved views, the project's Task state board named by the
 * project's own id, with their deprecated fields empty; and the timeline draws a lane per task type, with plans,
 * epics with their span, milestones and the slices of work the site's runs did, read in one round trip.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import type { TaskState } from '@prisma/client'
import { getProjectBoards, moveTaskToBoard } from '../boardOperations'
import { getAllBoards, getBoard, getBoards } from '../queries'
import { readTimeline } from '../timeline'
import { createTask } from '../taskService'
import { createTaskType } from '../taskTypeService'
import { saveBoard } from '../boardSaveService'
import { originByPerson } from '../taskOnBehalfOf'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { ctx } from './projectsHarness'

async function world() {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const bug = await createTaskType({ projectId: project.id, name: 'Bug' })
  const task = async (state: TaskState, data: Record<string, unknown> = {}, typeId?: string) => {
    const made = await createTask({ title: 'T', projectId: project.id, state, typeId, origin: originByPerson(person.id) })
    return Object.keys(data).length ? prisma.task.update({ where: { id: made.id }, data }) : made
  }
  return { person, project, bug, task }
}

describe('the deprecated board reads answer from saved views @SC-546', () => {
  it("lists the Task state board by the project's id, then the saved boards, each with its view and counts and no deprecated columns", async () => {
    const { person, project, bug, task } = await world()
    await task('TODO')
    await task('BACKLOG')
    await task('TODO', { executionState: 'NEEDS_YOU' }, bug.id)
    const bugs = await saveBoard({ projectId: project.id, name: 'Bugs', kind: 'TYPE', typeId: bug.id })

    const boards = await getProjectBoards({ projectId: project.id }, ctx(person))
    expect(boards.map(b => b.id)).toEqual([project.id, bugs.id])
    expect(boards[0]).toMatchObject({ kind: 'PROJECT_TASKS', name: 'Task state', columns: [], backlogCount: 0, needsYouCount: 1, view: { kind: 'STATE' } })
    expect(boards[0].viewColumns!.map(c => [c.key, c.count])).toEqual([['BACKLOG', 1], ['TODO', 2], ['IN_PROGRESS', 0], ['DONE', 0]])
    expect(boards[1]).toMatchObject({ kind: 'WORKFLOW', templateId: null, archivedAt: null, view: { kind: 'TYPE', typeId: bug.id } })
    expect((await getBoards({ projectId: project.id }, ctx(person) as never)).map(b => [b.id, b.columns])).toEqual([[project.id, []], [bugs.id, []]])
    expect((await getAllBoards(undefined, ctx(person) as never)).filter(b => b.project.id === project.id).map(b => b.id)).toEqual([project.id, bugs.id])
  })

  it("opens the Task state board by the project's id, its tasks in the project's order and no Backlog of its own", async () => {
    const { person, project, task } = await world()
    const first = await task('BACKLOG')
    const second = await task('TODO')
    const board = await getBoard({ boardId: project.id }, ctx(person) as never)
    expect(board).toMatchObject({ id: project.id, projectTasksBoardId: project.id, columns: [], backlog: [], showAlso: [], roundLine: null })
    expect(board.tasks.map(t => t.id)).toEqual([first.id, second.id])
    expect(board.tasks[0]).toMatchObject({ boardId: project.id, column: null, taskKey: `${project.key}-${first.number}` })
  })

  it("moving a task onto a board changes nothing, and is refused for another project's board", async () => {
    const { person, project, task } = await world()
    const t = await task('TODO')
    const before = await prisma.task.findUniqueOrThrow({ where: { id: t.id } })
    expect(await moveTaskToBoard({ taskId: t.id, boardId: project.id }, ctx(person))).toMatchObject({ id: t.id, state: 'TODO' })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toEqual(before)
    const elsewhere = await createProject({ accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: elsewhere.id, userId: person.id } })
    await expect(moveTaskToBoard({ taskId: t.id, boardId: elsewhere.id }, ctx(person))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('the timeline @SC-564', () => {
  const RANGE = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') }
  const NOW = new Date('2026-10-20T12:00:00Z')

  it('draws a lane per task type, the tasks with a plan, a start time or work in the range, never the Backlog; epics with their span; milestones', async () => {
    const { project, bug, task } = await world()
    const planned = await task('TODO', { planStart: new Date('2026-10-05'), planFinish: new Date('2026-10-07') }, bug.id)
    const scheduled = await task('TODO', { scheduleAt: new Date('2026-10-25T09:00:00Z'), scheduleNextDueAt: new Date('2026-10-25T09:00:00Z') }, bug.id)
    await task('TODO', { planStart: new Date('2026-12-01') }, bug.id)
    await task('BACKLOG', { planStart: new Date('2026-10-10') }, bug.id)
    const epicType = await prisma.taskType.findFirstOrThrow({ where: { projectId: project.id, kind: 'EPIC' } })
    const epic = await task('TODO', {}, epicType.id)
    await prisma.task.update({ where: { id: planned.id }, data: { epicId: epic.id } })
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Live', date: new Date('2026-10-30') } })
    await prisma.task.update({ where: { id: epic.id }, data: { milestoneId: milestone.id } })

    const timeline = await readTimeline(project.id, RANGE, NOW)
    const taskType = await prisma.taskType.findFirstOrThrow({ where: { projectId: project.id, kind: 'TASK' } })
    expect(timeline.lanes.map(l => [l.id, l.name, l.backlogCount])).toEqual([[taskType.id, 'Task', 0], [bug.id, 'Bug', 1]])
    expect(timeline.tasks.map(t => t.id).sort()).toEqual([planned.id, scheduled.id].sort())
    expect(timeline.tasks.find(t => t.id === planned.id)).toMatchObject({ laneId: bug.id, epicId: epic.id, key: expect.stringMatching(/-\d+$/) })
    // An epic is drawn in the first lane holding one of its tasks.
    expect(timeline.epics).toEqual([expect.objectContaining({
      id: epic.id, laneId: bug.id, milestoneId: milestone.id, taskIds: [planned.id],
      span: { start: new Date('2026-10-05T00:00:00Z'), finish: new Date('2026-10-07T00:00:00Z'), fromTasks: true },
    })])
    expect(timeline.milestones).toEqual([{ id: milestone.id, name: 'Live', date: new Date('2026-10-30T00:00:00Z'), epicIds: [epic.id] }])
  })

  it('puts the project\'s sprints in the first lane only', async () => {
    const { project } = await world()
    await prisma.sprint.create({ data: { projectId: project.id, number: 1, startDate: new Date('2026-10-05'), finishDate: new Date('2026-10-18') } })
    const timeline = await readTimeline(project.id, RANGE, NOW)
    expect(timeline.lanes.map(l => l.sprints.length)).toEqual([1, 0])
  })

  it("reads the runs' slices from the site in one read, and says when the site could not be asked @SC-565", async () => {
    const { project, task } = await world()
    const worked = await task('DONE')
    const siteId = (await prisma.executionSite.findFirstOrThrow({ where: { id: project.executionSiteId! } })).siteId
    siteStore.addRun(siteId, { id: 'r1', taskId: worked.id, status: 'COMPLETED', startedAt: '2026-10-08T10:00:00.000Z', endedAt: '2026-10-08T11:00:00.000Z', createdAt: '2026-10-08T10:00:00.000Z' })
    siteStore.addRun(siteId, { id: 'r2', taskId: 'another-projects-task', status: 'COMPLETED', startedAt: '2026-10-09T10:00:00.000Z', endedAt: '2026-10-09T11:00:00.000Z', createdAt: '2026-10-09T10:00:00.000Z' })

    const timeline = await readTimeline(project.id, RANGE, NOW)
    expect(timeline.tasks.map(t => t.id)).toEqual([worked.id])
    expect(timeline.runs).toEqual({ slices: [expect.objectContaining({ runId: 'r1', taskId: worked.id })], unavailable: null, truncated: false })
    expect(siteStore.listRunsPage).toHaveBeenCalledTimes(1)

    siteStore.makeSiteUnreachable(siteId)
    const unreachable = await readTimeline(project.id, RANGE, NOW)
    expect(unreachable.runs.slices).toEqual([])
    expect(unreachable.runs.unavailable).toEqual(expect.any(String))
  })
})
