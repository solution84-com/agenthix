/**
 * What Plan Sprint and Sprints read beside the series, against the real test DB (spec N1, the Sprints design): the
 * Backlog and To do tasks in no sprint, with no epic among them, and the project's epics; and a sprint's load by
 * every agent of the project, 0 included, and the epics its tasks move forward, by title.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createUser, createProject } from '../../test/factories'

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
import { originByPerson } from '../taskOnBehalfOf'
import { planIntoSprint, startSprints } from '../projectSprintService'
import { readProjectSprints } from '../projectSprintView'
import { readSprintPlanning } from '../sprintPlanningView'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

async function setUp() {
  const person = await createUser()
  const p = await createProject()
  const builtIn = await ensureBuiltInTaskTypes(p.id)
  const make = (title: string, extra: Record<string, unknown> = {}) => createTask({ title, projectId: p.id, origin: originByPerson(person.id), ...extra })
  return { project: p, builtIn, make }
}

describe('what can be planned', () => {
  it('lists Backlog and To do in no sprint, in rank order, leaving out epics, done work, other sprints and archived tasks', async () => {
    const { project: p, builtIn, make } = await setUp()
    const sprint = await startSprints(p.id, { startDate: day('2026-11-02'), days: 14 })
    const idea = await make('Idea')
    const todo = await make('Committed')
    await moveTask(todo.id, { state: 'TODO' })
    const done = await make('Shipped')
    await moveTask(done.id, { state: 'DONE' })
    const planned = await make('Planned')
    await planIntoSprint(sprint.id, [planned.id])
    const archived = await make('Old')
    await prisma.task.update({ where: { id: archived.id }, data: { archived: true } })
    const epic = await make('Launch pages', { typeId: builtIn.EPIC })

    const read = await readSprintPlanning(p.id)
    expect(read.tasks.map(t => t.title)).toEqual(['Idea', 'Committed'])
    expect(read.tasks[0]).toMatchObject({ id: idea.id, state: 'BACKLOG' })
    expect(read.epics).toEqual([{ id: epic.id, key: `${p.key}-${epic.number}`, title: 'Launch pages' }])
  })
})

describe('a sprint summary', () => {
  it("names every agent of the project in its load, 0 included, and its epics by title", async () => {
    const { project: p, builtIn, make } = await setUp()
    const writer = await createAgent({ name: 'Writer' })
    const designer = await createAgent({ name: 'Designer' })
    await prisma.projectAgent.create({ data: { projectId: p.id, agentId: writer.id, createdAt: day('2026-11-01') } })
    await prisma.projectAgent.create({ data: { projectId: p.id, agentId: designer.id, createdAt: day('2026-11-02') } })
    const sprint = await startSprints(p.id, { startDate: day('2026-11-02'), days: 14 })
    const epic = await make('Launch pages', { typeId: builtIn.EPIC })
    const a = await make('Pricing copy', { epicId: epic.id })
    await prisma.task.update({ where: { id: a.id }, data: { assignedAgentId: writer.id } })
    await planIntoSprint(sprint.id, [a.id])

    const read = await readProjectSprints(p.id, day('2026-11-05'))
    expect(read.current?.load).toEqual([
      { agentId: writer.id, name: 'Writer', count: 1 },
      { agentId: designer.id, name: 'Designer', count: 0 },
    ])
    expect(read.current?.epics).toEqual([{ epicId: epic.id, key: `${p.key}-${epic.number}`, title: 'Launch pages', count: 1 }])
  })
})
