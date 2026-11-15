/**
 * A write into a task or board follows the project's own membership (spec
 * §6.4), against the real test DB. Both people hold the ADMIN org role, so no
 * role floor can be what refuses the outsider — only membership can — and a
 * refusal is shown to have written nothing by comparing every row it could
 * have touched, before and after.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { ctx, columnOfState, makeBoard, makeTask, privateProjectCast, projectState } from './projectsHarness'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/dispatchService', () => import('../../test/fakes/dispatchService'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))

import {
  createTask, updateTask, deleteTask, archiveTask, moveTaskToColumn,
  unarchiveTask, addTaskComment, runTask,
} from '../actions'
import { startAgentInProject, startAllAgents, stopAgentInProject } from '../agentLineOperations'
import { finishProjectSprint, updateProjectSprint } from '../sprintOperations'
import { saveBoardView } from '../boardViewOperations'
import { updateTaskPlan, createMilestone, updateMilestone, deleteMilestone } from '../planOperations'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'

type Cast = Awaited<ReturnType<typeof privateProjectCast>>
// A Wasp operation answers its output or a promise of it, so a call is typed `unknown` and awaited through Promise.resolve.
type Case = { name: string; call: (c: Cast, context: any) => unknown; prepare?: (c: Cast) => Promise<unknown> }

const cases: Case[] = [
  { name: 'createTask', call: (c, x) => createTask({ projectId: c.project.id, title: 'x' }, x) },
  { name: 'updateTask', call: (c, x) => updateTask({ taskId: c.task.id, title: 'x' }, x) },
  { name: 'deleteTask', call: (c, x) => deleteTask({ taskId: c.task.id }, x) },
  { name: 'archiveTask', call: (c, x) => archiveTask({ taskId: c.task.id }, x) },
  { name: 'moveTaskToColumn', call: async (c, x) => moveTaskToColumn({ taskId: c.task.id, columnId: await columnOfState(c.project.id, 'IN_PROGRESS') }, x) },
  { name: 'updateTaskPlan', call: (c, x) => updateTaskPlan({ taskId: c.task.id, planStart: '2026-10-08' }, x) },
  { name: 'createMilestone', call: (c, x) => createMilestone({ projectId: c.project.id, name: 'm', date: '2026-11-30' }, x) },
  {
    name: 'updateMilestone',
    call: async (c, x) => updateMilestone({ milestoneId: (await prisma.milestone.findFirstOrThrow({ where: { projectId: c.project.id } })).id, name: 'n' }, x),
    prepare: (c) => prisma.milestone.create({ data: { projectId: c.project.id, name: 'm', date: new Date('2026-11-30') } }),
  },
  {
    name: 'deleteMilestone',
    call: async (c, x) => deleteMilestone({ milestoneId: (await prisma.milestone.findFirstOrThrow({ where: { projectId: c.project.id } })).id }, x),
    prepare: (c) => prisma.milestone.create({ data: { projectId: c.project.id, name: 'm', date: new Date('2026-11-30') } }),
  },
  {
    name: 'unarchiveTask', call: (c, x) => unarchiveTask({ taskId: c.task.id }, x),
    prepare: (c) => prisma.task.update({ where: { id: c.task.id }, data: { archived: true } }),
  },
  { name: 'addTaskComment', call: (c, x) => addTaskComment({ taskId: c.task.id, content: 'hi' }, x) },
  { name: 'runTask', call: (c, x) => runTask({ taskId: c.task.id }, x) },
  { name: 'saveBoardView', call: (c, x) => saveBoardView({ projectId: c.project.id, name: 'b', kind: 'STATE' }, x) },
  {
    name: 'finishProjectSprint',
    call: async (c, x) => finishProjectSprint({ sprintId: (await prisma.sprint.findFirstOrThrow({ where: { projectId: c.project.id } })).id, unfinished: 'next' }, x),
    prepare: (c) => prisma.sprint.create({ data: { projectId: c.project.id, number: 1, startDate: new Date('2026-10-01'), finishDate: new Date('2026-10-14') } }),
  },
  {
    name: 'updateProjectSprint',
    call: async (c, x) => updateProjectSprint({ sprintId: (await prisma.sprint.findFirstOrThrow({ where: { projectId: c.project.id } })).id, name: 'n' }, x),
    prepare: (c) => prisma.sprint.create({ data: { projectId: c.project.id, number: 1, startDate: new Date('2026-10-01'), finishDate: new Date('2026-10-14') } }),
  },
  {
    name: 'startAgentInProject', call: (c, x) => startAgentInProject({ projectId: c.project.id, agentId: c.agent.id, taskIds: [c.task.id] }, x),
    prepare: (c) => prisma.task.update({ where: { id: c.task.id }, data: { runState: 'RUN_NONE', state: 'TODO', assignedAgentId: c.agent.id } }),
  },
  {
    name: 'startAllAgents', call: (c, x) => startAllAgents({ projectId: c.project.id, taskIds: [c.task.id] }, x),
    prepare: (c) => prisma.task.update({ where: { id: c.task.id }, data: { runState: 'RUN_NONE', state: 'TODO', assignedAgentId: c.agent.id } }),
  },
  {
    name: 'stopAgentInProject', call: (c, x) => stopAgentInProject({ projectId: c.project.id, agentId: c.agent.id }, x),
    prepare: (c) => prisma.task.update({ where: { id: c.task.id }, data: { runState: 'RUN_QUEUED', runStartedBy: 'person', assignedAgentId: c.agent.id } }),
  },
]

describe('a write into a project requires membership of it', () => {
  for (const { name, call, prepare } of cases) {
    it(`${name} refuses an org admin who is not a member of this private project, and writes nothing`, async () => {
      const cast = await privateProjectCast()
      await prepare?.(cast)
      const before = await projectState()

      await expect(Promise.resolve(call(cast, ctx(cast.outsider)))).rejects.toMatchObject({ statusCode: 403 })

      expect(await projectState()).toEqual(before)
      expect(taskRunnerFake.startedTasks).toEqual([])
    })

    it(`${name} allows a member`, async () => {
      const cast = await privateProjectCast()
      await prepare?.(cast)
      await expect(Promise.resolve(call(cast, ctx(cast.member)))).resolves.not.toBeInstanceOf(Error)
    })
  }
})

describe('Start only puts in line tasks of the project it checked the caller against', () => {
  // A ticked id from another project must never be started on the say-so of a member of this one.
  it("excludes another project's task given with the ticks, even for a member", async () => {
    const cast = await privateProjectCast()
    const other = await privateProjectCast()
    const foreign = await makeTask(other.project.id, { runState: 'RUN_NONE', state: 'TODO', assignedAgentId: cast.agent.id })

    await expect(startAllAgents({ projectId: cast.project.id, taskIds: [foreign.id] }, ctx(cast.member))).resolves.toEqual({ started: 0, agents: 0 })
    await expect(startAgentInProject({ projectId: cast.project.id, agentId: cast.agent.id, taskIds: [foreign.id] }, ctx(cast.member))).resolves.toEqual({ started: 0, agents: 0 })
    expect((await prisma.task.findUniqueOrThrow({ where: { id: foreign.id } })).runState).toBe('RUN_NONE')
  })
})
