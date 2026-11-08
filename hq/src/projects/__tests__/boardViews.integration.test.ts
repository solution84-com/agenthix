/**
 * What the Boards and Timeline tools read (every screen reviewed spec §3),
 * against the real test DB: the boards list with its counts, a board with its
 * Backlog and the other backlogs a person shows beside it, and the timeline —
 * plans, epics with their span, milestones, routine rounds and the slices of
 * work the site's runs did, read in one round trip. Written by lane W of the
 * every-screen-reviewed unit; run by the lead.
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

import { getProjectBoards, moveTaskToBoard } from '../boardOperations'
import { getBoard } from '../queries'
import { readTimeline } from '../timeline'
import { ensureProjectTasks } from '../boardService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { ctx } from './projectsHarness'

const COLUMNS = [
  { name: 'todo', label: 'To Do', status: 'TODO', order: 0, color: 'x' },
  { name: 'done', label: 'Done', status: 'DONE', order: 1, color: 'x' },
]
let number = 0

async function world() {
  const person = await createUserWithRole('MEMBER')
  const project = await createProject({ accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: person.id } })
  const projectTasks = await ensureProjectTasks(project.id)
  const bugs = await prisma.board.create({ data: { name: 'Bugs', projectId: project.id, columns: COLUMNS } })
  const task = (boardId: string, data: Record<string, unknown> = {}) => prisma.task.create({
    data: { title: `T${++number}`, projectId: project.id, number, boardId, onBehalfOfUserId: person.id, ...data } as never,
  })
  return { person, project, projectTasks, bugs, task }
}

describe('the boards list @SC-546', () => {
  it('lists Project Tasks first with its column counts, Backlog count and how many need a person; archived only when asked', async () => {
    const { person, project, projectTasks, bugs, task } = await world()
    await task(projectTasks, { column: 'todo' })
    await task(projectTasks)
    await task(bugs.id, { column: 'todo', runState: 'RUN_BLOCKED' })
    const old = await prisma.board.create({ data: { name: 'Old', projectId: project.id, archivedAt: new Date() } })

    const boards = await getProjectBoards({ projectId: project.id }, ctx(person))
    expect(boards.map(b => b.id)).toEqual([projectTasks, bugs.id])
    expect(boards[0]).toMatchObject({ kind: 'PROJECT_TASKS', backlogCount: 1, needsYouCount: 0 })
    expect(boards[0].columns.map(c => [c.name, c.count])).toEqual([['todo', 1], ['in_progress', 0], ['done', 0]])
    expect(boards[1]).toMatchObject({ backlogCount: 0, needsYouCount: 1, currentSprint: null })
    expect((await getProjectBoards({ projectId: project.id, includeArchived: true }, ctx(person))).map(b => b.id)).toContain(old.id)
  })
})

describe("a board's Backlog @SC-545", () => {
  it("a task moved to another board lands in that board's Backlog @SC-543", async () => {
    const { person, projectTasks, bugs, task } = await world()
    const t = await task(projectTasks, { column: 'todo' })
    await moveTaskToBoard({ taskId: t.id, boardId: bugs.id }, ctx(person))
    expect((await getBoard({ boardId: bugs.id }, ctx(person))).backlog.map(x => x.id)).toEqual([t.id])
  })
})

describe('the timeline @SC-564', () => {
  const RANGE = { from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-01T00:00:00Z') }
  const NOW = new Date('2026-10-20T12:00:00Z')

  it('has the tasks with a plan, a start time or work in the range, never the Backlog; epics with their span; milestones; no routine', async () => {
    const { project, projectTasks, bugs, task } = await world()
    const planned = await task(bugs.id, { column: 'todo', planStart: new Date('2026-10-05'), planFinish: new Date('2026-10-07') })
    const scheduled = await task(bugs.id, { column: 'todo', scheduleAt: new Date('2026-10-25T09:00:00Z'), scheduleNextDueAt: new Date('2026-10-25T09:00:00Z') })
    await task(bugs.id, { column: 'todo', planStart: new Date('2026-12-01') })
    await task(bugs.id, { planStart: new Date('2026-10-10') })
    const epic = await task(projectTasks, { isEpic: true })
    await prisma.task.update({ where: { id: planned.id }, data: { epicId: epic.id } })
    const milestone = await prisma.milestone.create({ data: { projectId: project.id, name: 'Live', date: new Date('2026-10-30') } })
    await prisma.task.update({ where: { id: epic.id }, data: { milestoneId: milestone.id } })
    await prisma.routine.create({
      data: { projectId: project.id, title: 'Weekly', cron: '0 9 * * 2', timezone: 'UTC', nextDueAt: new Date('2026-10-06T09:00:00Z'), onBehalfOfUserId: 'p' },
    })

    const timeline = await readTimeline(project.id, null, RANGE, NOW)
    expect(timeline.boards.map(b => [b.id, b.backlogCount])).toEqual([[projectTasks, 0], [bugs.id, 1]])
    expect(timeline.tasks.map(t => t.id).sort()).toEqual([planned.id, scheduled.id].sort())
    expect(timeline.tasks.find(t => t.id === planned.id)).toMatchObject({ epicId: epic.id, key: expect.stringMatching(/-\d+$/) })
    expect(timeline.epics).toEqual([expect.objectContaining({
      id: epic.id, milestoneId: milestone.id, taskIds: [planned.id],
      span: { start: new Date('2026-10-05T00:00:00Z'), finish: new Date('2026-10-07T00:00:00Z'), fromTasks: true },
    })])
    expect(timeline.milestones).toEqual([{ id: milestone.id, name: 'Live', date: new Date('2026-10-30T00:00:00Z'), epicIds: [epic.id] }])
    // A routine is on no board (adr-0177).
    expect(timeline.routineRounds).toEqual([])
  })

  it("reads the runs' slices from the site in one read, and says when the site could not be asked @SC-565", async () => {
    const { project, bugs, task } = await world()
    const worked = await task(bugs.id, { column: 'done', status: 'DONE' })
    const siteId = (await prisma.executionSite.findFirstOrThrow({ where: { id: project.executionSiteId! } })).siteId
    siteStore.addRun(siteId, { id: 'r1', taskId: worked.id, status: 'COMPLETED', startedAt: '2026-10-08T10:00:00.000Z', endedAt: '2026-10-08T11:00:00.000Z', createdAt: '2026-10-08T10:00:00.000Z' })
    siteStore.addRun(siteId, { id: 'r2', taskId: 'another-projects-task', status: 'COMPLETED', startedAt: '2026-10-09T10:00:00.000Z', endedAt: '2026-10-09T11:00:00.000Z', createdAt: '2026-10-09T10:00:00.000Z' })

    const timeline = await readTimeline(project.id, bugs.id, RANGE, NOW)
    expect(timeline.tasks.map(t => t.id)).toEqual([worked.id])
    expect(timeline.runs).toEqual({ slices: [expect.objectContaining({ runId: 'r1', taskId: worked.id })], unavailable: null, truncated: false })
    expect(siteStore.listRunsPage).toHaveBeenCalledTimes(1)

    siteStore.makeSiteUnreachable(siteId)
    const unreachable = await readTimeline(project.id, bugs.id, RANGE, NOW)
    expect(unreachable.runs.slices).toEqual([])
    expect(unreachable.runs.unavailable).toEqual(expect.any(String))
  })
})
