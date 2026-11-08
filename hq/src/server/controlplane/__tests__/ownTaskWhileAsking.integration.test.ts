/**
 * A run whose site says it is waiting for an approval cannot change its own task's state, column or type, by
 * update_task or change_tasks, naming it by its id or its key; nothing about the task changes. Against the real test
 * database, through callOperation, which resolves a key as every call does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { callOperation } from '../operations'
import { OWN_TASK_HELD_WHILE_ASKING } from '../ownTaskWhileAsking'
import { seedAutomation, taskRun, type AutomationWorld } from './automationFixtures'
import type { CallerContext } from '../types'

let w: AutomationWorld
let ownKey: string
beforeEach(async () => {
  w = await seedAutomation()
  const project = await prisma.project.findUniqueOrThrow({ where: { id: w.projectId }, select: { key: true } })
  ownKey = `${project.key}-1`
})

const waiting = (): CallerContext => ({ ...taskRun(w), waitingForApproval: true } as CallerContext)
const own = () => prisma.task.findUniqueOrThrow({ where: { id: 't0' }, select: { state: true, columnId: true, typeId: true } })

describe('a run waiting for an approval keeps its own task where it is', () => {
  it.each([
    ['its id', () => 't0'],
    ['its key', () => ownKey],
    ['its key in lower case', () => ownKey.toLowerCase()],
  ])('update_task to DONE by %s is refused, and the task is unchanged', async (_, taskId) => {
    const before = await own()
    await expect(callOperation('update_task', waiting(), { taskId: taskId(), state: 'DONE' }))
      .rejects.toMatchObject({ code: 'conflict', message: OWN_TASK_HELD_WHILE_ASKING })
    expect(await own()).toEqual(before)
  })

  it('change_tasks to DONE with its own task among others is refused whole', async () => {
    await expect(callOperation('change_tasks', waiting(), { taskIds: ['t1', ownKey], state: 'DONE' }))
      .rejects.toMatchObject({ message: OWN_TASK_HELD_WHILE_ASKING })
    expect(await prisma.task.findUniqueOrThrow({ where: { id: 't1' }, select: { state: true } })).toEqual({ state: 'TODO' })
  })

  it('may still change another task, and its own task once it has asked for nothing', async () => {
    await callOperation('update_task', waiting(), { taskId: 't1', state: 'DONE' })
    await callOperation('update_task', taskRun(w), { taskId: ownKey, state: 'DONE' })
    expect((await own()).state).toBe('DONE')
  })
})
