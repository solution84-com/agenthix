/**
 * A project's sprints (adr-0176, spec D8, D13, N1, N7), against the real test DB: one series; up to two planned
 * ahead; a Backlog task planned in moves to To do on its type's default column; finishing is explicit, only the
 * current one, its done tasks staying and the rest moving on or left in no sprint; past its last day it stays
 * current, overdue; two finishes at once finish it once.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import { createTask } from '../taskService'
import { moveTask } from '../taskColumnService'
import { ensureBuiltInTaskTypes } from '../taskTypes'
import { createTaskType } from '../taskTypeService'
import { addTypeColumn, setDefaultColumn } from '../typeColumnService'
import { originByPerson } from '../taskOnBehalfOf'
import {
  addNextSprint, EPIC_NOT_IN_SPRINT, finishProjectSprint, ONLY_CURRENT_FINISHES, planIntoSprint, SAY_WHERE_UNFINISHED, setSprintLength,
  SPRINT_FINISHED, SPRINTS_ALREADY_STARTED, startSprints, takeOutOfSprint, updateProjectSprint,
} from '../projectSprintService'
import { readProjectSprints, readSprintTasks } from '../projectSprintView'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

async function project() {
  const person = await createUser()
  const p = await createProject()
  const builtIn = await ensureBuiltInTaskTypes(p.id)
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { person, project: p, builtIn, make }
}

const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } })

describe('the series', () => {
  it('starts once, plans up to two ahead, each the day after the last', async () => {
    const { project: p } = await project()
    const s1 = await startSprints(p.id, { startDate: day('2026-11-03'), days: 14 })
    expect(s1).toMatchObject({ number: 1, startDate: day('2026-11-03'), finishDate: day('2026-11-16'), finishedAt: null })
    await expect(startSprints(p.id, { startDate: day('2026-11-03'), days: 14 })).rejects.toMatchObject({ message: SPRINTS_ALREADY_STARTED })
    const s2 = await addNextSprint(p.id)
    expect(s2).toMatchObject({ number: 2, startDate: day('2026-11-17'), finishDate: day('2026-11-30') })
    await addNextSprint(p.id)
    await expect(addNextSprint(p.id)).rejects.toMatchObject({ statusCode: 409 })
    const read = await readProjectSprints(p.id, day('2026-11-08'))
    expect(read).toMatchObject({ lengthDays: 14, current: { number: 1, status: 'current', daysLeft: 9 }, mayPlanAhead: false })
    expect(read.upcoming.map(s => s.number)).toEqual([2, 3])
  })

  it('a new length re-lays the upcoming sprints; the current keeps its dates', async () => {
    const { project: p } = await project()
    await startSprints(p.id, { startDate: day('2026-11-03'), days: 14 })
    await addNextSprint(p.id)
    const series = await setSprintLength(p.id, 7)
    expect(series.map(s => [s.number, s.startDate, s.finishDate])).toEqual([
      [1, day('2026-11-03'), day('2026-11-16')],
      [2, day('2026-11-17'), day('2026-11-23')],
    ])
  })

  it('renames a sprint keeping its number, and sets its goal', async () => {
    const { project: p } = await project()
    const s = await startSprints(p.id, { startDate: day('2026-11-03'), days: 14 })
    expect(await updateProjectSprint(s.id, { name: 'Pricing push', goal: 'Launch pages ready' })).toMatchObject({ number: 1, name: 'Pricing push', goal: 'Launch pages ready' })
    expect(await updateProjectSprint(s.id, { name: null })).toMatchObject({ name: null, goal: 'Launch pages ready' })
  })
})

describe('planning', () => {
  it('a Backlog task planned into a sprint moves to To do, on its type\'s default To do column (N1)', async () => {
    const { project: p, make } = await project()
    const bug = await createTaskType({ projectId: p.id, name: 'Bug' })
    const triaged = (await addTypeColumn({ typeId: bug.id, name: 'Triaged', state: 'TODO' })).columns.find(c => c.name === 'Triaged')!
    await setDefaultColumn(triaged.id)
    const backlog = await make('Idea', { typeId: bug.id })
    const doing = await make('Doing', { state: 'IN_PROGRESS' })
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await planIntoSprint(s.id, [backlog.id, doing.id])
    expect(await row(backlog.id)).toMatchObject({ sprintId: s.id, state: 'TODO', columnId: triaged.id })
    expect(await row(doing.id)).toMatchObject({ sprintId: s.id, state: 'IN_PROGRESS' })
  })

  it('places one task in the order, and the sprint lists its tasks in rank order', async () => {
    const { project: p, make } = await project()
    const a = await make('A', { state: 'TODO' })
    const b = await make('B', { state: 'TODO' })
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await planIntoSprint(s.id, [a.id])
    await planIntoSprint(s.id, [b.id], { beforeTaskId: a.id })
    expect((await readSprintTasks(s.id)).map(c => c.title)).toEqual(['B', 'A'])
    await expect(planIntoSprint(s.id, [a.id, b.id], { afterTaskId: a.id })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses an epic, another project\'s task, and a finished sprint', async () => {
    const { project: p, builtIn, make } = await project()
    const epic = await make('Epic', { typeId: builtIn.EPIC })
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await expect(planIntoSprint(s.id, [epic.id])).rejects.toMatchObject({ message: EPIC_NOT_IN_SPRINT })
    const other = await project()
    const theirs = await other.make('Theirs')
    await expect(planIntoSprint(s.id, [theirs.id])).rejects.toMatchObject({ statusCode: 400 })
    await finishProjectSprint(s.id, undefined)
    const t = await make('Late')
    await expect(planIntoSprint(s.id, [t.id])).rejects.toMatchObject({ message: SPRINT_FINISHED })
  })

  it('taking a task out keeps its state and column', async () => {
    const { project: p, make } = await project()
    const t = await make('A')
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await planIntoSprint(s.id, [t.id])
    const before = await row(t.id)
    await takeOutOfSprint(p.id, [t.id])
    expect(await row(t.id)).toMatchObject({ sprintId: null, state: before.state, columnId: before.columnId })
  })
})

describe('finishing', () => {
  it('asks where the unfinished go; done tasks stay recorded; the rest move on to the next, which becomes current', async () => {
    const { project: p, make } = await project()
    const done = await make('Done one', { state: 'TODO' })
    const open = await make('Open one', { state: 'TODO' })
    const s1 = await startSprints(p.id, { startDate: day('2026-11-03'), days: 14 })
    await planIntoSprint(s1.id, [done.id, open.id])
    await moveTask(done.id, { state: 'DONE' })
    await expect(finishProjectSprint(s1.id, undefined)).rejects.toMatchObject({ message: SAY_WHERE_UNFINISHED })
    const result = await finishProjectSprint(s1.id, 'next', null, day('2026-11-17'))
    expect(result).toMatchObject({ finished: { number: 1, unfinishedCount: 1, unfinishedMovedOn: true }, next: { number: 2 }, movedTaskIds: [open.id] })
    expect((await row(done.id)).sprintId).toBe(s1.id)
    expect(await row(open.id)).toMatchObject({ sprintId: result.next.id, state: 'TODO' })
    const read = await readProjectSprints(p.id, day('2026-11-18'))
    expect(read.current?.number).toBe(2)
    expect(read.past[0]).toMatchObject({ number: 1, counts: { DONE: 1, total: 1 }, unfinishedCount: 1 })
  })

  it('"none" leaves the unfinished in no sprint, their state and column as they were', async () => {
    const { project: p, make } = await project()
    const t = await make('Open', { state: 'IN_PROGRESS' })
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    await planIntoSprint(s.id, [t.id])
    const before = await row(t.id)
    await finishProjectSprint(s.id, 'none')
    expect(await row(t.id)).toMatchObject({ sprintId: null, state: 'IN_PROGRESS', columnId: before.columnId })
  })

  it('finishes only the current sprint, and only once when two finish it at once', async () => {
    const { project: p } = await project()
    const s1 = await startSprints(p.id, { startDate: new Date(), days: 14 })
    const s2 = await addNextSprint(p.id)
    await expect(finishProjectSprint(s2.id, undefined)).rejects.toMatchObject({ message: ONLY_CURRENT_FINISHES })
    const outcomes = await Promise.allSettled([finishProjectSprint(s1.id, undefined), finishProjectSprint(s1.id, undefined)])
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.sprint.count({ where: { projectId: p.id } })).toBe(2)
  })

  it('past its last day it stays current, overdue (N7)', async () => {
    const { project: p } = await project()
    await startSprints(p.id, { startDate: day('2026-11-03'), days: 12 })
    const read = await readProjectSprints(p.id, day('2026-11-16'))
    expect(read.current).toMatchObject({ number: 1, daysLeft: 0, daysOverdue: 2, finishedAt: null })
  })

  it('a task planned in while the sprint is finished is never left in the finished sprint', async () => {
    const { project: p, make } = await project()
    const t = await make('Racer')
    const s = await startSprints(p.id, { startDate: new Date(), days: 14 })
    const [plan] = await Promise.allSettled([planIntoSprint(s.id, [t.id]), finishProjectSprint(s.id, 'none')])
    // Whichever takes the sprint's lock first: planned, then left in no sprint by the finish; or refused after it.
    if (plan.status === 'rejected') expect(plan.reason).toMatchObject({ message: SPRINT_FINISHED })
    expect((await row(t.id)).sprintId).toBeNull()
  })
})
