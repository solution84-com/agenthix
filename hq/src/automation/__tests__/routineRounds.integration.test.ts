/**
 * Routines against Postgres (spec §3, adr-0092): overlapping ticks — or two hq
 * processes — move a routine on once and leave exactly one waiting round; a
 * time missed while hq was down creates its round once; and no column queues a
 * round before its time. How a round starts at its time (adr-0104) is
 * routineRoundStart.integration.test.ts. Run by the lead.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma: testDbPrisma } = await import('../../test/db')
  return { prisma: testDbPrisma, HttpError: class HttpError extends Error {} }
})
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createRoundsDue } from '../routineRounds'
import { createRoutine } from '../routines'
import { moveTaskToColumn } from '../../projects/taskService'
import { emitTaskUpdated } from '../../server/socket'
import { assignAgent, taskIn } from './automationWorld'

let n = 0
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${n++}`
const DAILY = { kind: 'interval', every: 1, unit: 'days' } as const
const COLUMNS = [
  { name: 'todo', label: 'To do', status: 'TODO', color: 'grey', order: 0, autoQueue: false },
  { name: 'ready', label: 'Ready', status: 'TODO', color: 'grey', order: 1, autoQueue: true },
  { name: 'done', label: 'Done', status: 'DONE', color: 'grey', order: 2 },
]

async function setUp(column: string, now: Date, at = '2026-10-01T09:00:00Z') {
  const project = await createProject({ name: 'R', key: `RT${(n++).toString().padStart(3, '0')}`.slice(0, 6) })
  const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: COLUMNS } as any })
  const agent = await prisma.agent.create({ data: { name: 'A', handle: uniq('agent') } as any })
  await assignAgent(project.id, agent.id)
  const routine = await createRoutine(
    project.id,
    { title: 'Board review', description: null, priority: 'MEDIUM', labels: [], assignedAgentId: agent.id, boardId: board.id, column },
    { rule: DAILY, at, timezone: 'UTC' },
    { kind: 'person', userId: 'person-1' },
    now,
  )
  return { project, board, routine }
}

const rounds = (routineId: string) => prisma.task.findMany({ where: { routineId }, orderBy: { roundAt: 'asc' } })

describe('a routine against the database @SC-681 @SC-683', () => {
  it('two ticks reaching the same round time move it on once: one round arrives, one new round waits', async () => {
    const { routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    const at = new Date('2026-10-05T09:00:20Z')
    await Promise.all([createRoundsDue(at), createRoundsDue(at)])
    const all = await rounds(routine.id)
    expect(all).toHaveLength(2)
    expect(all.filter(t => t.roundAt! > at)).toHaveLength(1)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.nextRoundAt).toEqual(new Date('2026-10-06T09:00:00Z'))
  })

  it('a time missed while hq was down creates its round once, for the next time after now', async () => {
    const { routine } = await setUp('todo', new Date('2026-10-05T08:00:00Z'))
    const back = new Date('2026-10-09T15:00:00Z')
    await createRoundsDue(back)
    await createRoundsDue(back)
    const all = await rounds(routine.id)
    expect(all).toHaveLength(2)
    expect(all[1].roundAt).toEqual(new Date('2026-10-10T09:00:00Z'))
  })

  it('at its time the round is handed to the start-time path: its start time is due now, in any column', async () => {
    const auto = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    const plain = await setUp('todo', new Date('2026-10-05T08:00:00Z'))
    await createRoundsDue(new Date('2026-10-05T09:00:20Z'))
    const [reachedAuto] = await rounds(auto.routine.id)
    const [reachedPlain] = await rounds(plain.routine.id)
    expect(reachedAuto).toMatchObject({ runState: 'RUN_NONE', scheduleNextDueAt: new Date('2026-10-05T09:00:00Z') })
    expect(reachedPlain).toMatchObject({ runState: 'RUN_NONE', scheduleNextDueAt: new Date('2026-10-05T09:00:00Z') })
  })

  it('no column queues a round before its time: moved into a column that queues, it waits for its time', async () => {
    // The move compares the round's time with the clock, so the round is put
    // twelve hours from now rather than at a fixed hour the clock may just have passed.
    const now = new Date()
    const { board, routine } = await setUp('todo', now, new Date(now.getTime() + 12 * 3_600_000).toISOString())
    const [waiting] = await rounds(routine.id)
    expect(waiting.roundAt!.getTime()).toBeGreaterThan(Date.now())
    await moveTaskToColumn({ taskId: waiting.id, column: 'ready', boardId: board.id })
    expect((await prisma.task.findUnique({ where: { id: waiting.id } }))!.runState).toBe('RUN_NONE')
  })
})

describe('a routine\'s round time reached, the rest of the rule @SC-681 @SC-683', () => {
  const TICK = new Date('2026-10-05T09:00:10Z')
  const REACHED = new Date('2026-10-05T09:00:00Z')

  it('takes every enabled routine due within the tick\'s minute, and none due later or paused', async () => {
    const due = await setUp('todo', new Date('2026-10-05T08:00:00Z'))
    const later = await setUp('todo', new Date('2026-10-05T08:00:00Z'), '2026-10-05T09:02:00Z')
    const paused = await setUp('todo', new Date('2026-10-05T08:00:00Z'))
    await prisma.routine.update({ where: { id: paused.routine.id }, data: { enabled: false } })
    expect(await createRoundsDue(TICK)).toBe(1)
    expect((await prisma.routine.findUnique({ where: { id: due.routine.id } }))!.nextRoundAt).toEqual(new Date('2026-10-06T09:00:00Z'))
    expect((await prisma.routine.findUnique({ where: { id: later.routine.id } }))!.nextRoundAt).toEqual(new Date('2026-10-05T09:02:00Z'))
    expect((await prisma.routine.findUnique({ where: { id: paused.routine.id } }))!.nextRoundAt).toEqual(REACHED)
  })

  it('creates the next round from the template, linked, for the time after — never queued, its time is to come', async () => {
    const { project, board, routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    await prisma.routine.update({ where: { id: routine.id }, data: { description: 'Look at the board', priority: 'HIGH', labels: ['ops'] } })
    await createRoundsDue(TICK)
    const next = (await rounds(routine.id)).find(t => t.roundAt!.getTime() > TICK.getTime())!
    expect(next).toMatchObject({
      title: 'Board review', priority: 'HIGH', labels: ['ops'], projectId: project.id, number: 2, boardId: board.id, column: 'ready',
      status: 'TODO', assignedAgentId: routine.assignedAgentId, runState: 'RUN_NONE', onBehalfOfUserId: 'person-1',
      roundAt: new Date('2026-10-06T09:00:00Z'), scheduleNextDueAt: null,
    })
  })

  it('a claim lost to another tick (or another hq) does nothing at all', async () => {
    const { routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    await prisma.routine.update({ where: { id: routine.id }, data: { nextRoundAt: new Date('2026-10-05T09:30:00Z') } })
    expect(await createRoundsDue(TICK)).toBe(0)
    expect((await rounds(routine.id)).map(t => t.runState)).toEqual(['RUN_NONE'])
  })

  it('claims, hands over and creates in one transaction, so a failure leaves the routine due for the next tick', async () => {
    const { project, routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    // A task number at the integer limit makes the next round's creation fail after the claim.
    await taskIn(project.id, { number: 2147483647 })
    expect(await createRoundsDue(TICK)).toBe(0)
    expect((await prisma.routine.findUnique({ where: { id: routine.id } }))!.nextRoundAt).toEqual(REACHED)
    const [waiting] = await rounds(routine.id)
    expect(waiting).toMatchObject({ runState: 'RUN_NONE', scheduleNextDueAt: null })
  })

  it('with its waiting round gone (deleted or unlinked), still creates the next', async () => {
    const { routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    await prisma.task.deleteMany({ where: { routineId: routine.id } })
    await createRoundsDue(TICK)
    expect((await rounds(routine.id)).map(t => t.roundAt)).toEqual([new Date('2026-10-06T09:00:00Z')])
  })

  it("a round on a board deleted since starts in Project Tasks' Backlog; an agent deleted since leaves it unassigned", async () => {
    const { project, board, routine } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    await prisma.task.deleteMany({ where: { routineId: routine.id } })
    await prisma.board.delete({ where: { id: board.id } })
    await prisma.agent.delete({ where: { id: routine.assignedAgentId! } })
    await createRoundsDue(TICK)
    const projectTasks = await prisma.board.findFirstOrThrow({ where: { projectId: project.id, kind: 'PROJECT_TASKS' } })
    expect(await rounds(routine.id)).toEqual([
      expect.objectContaining({ boardId: projectTasks.id, column: null, assignedAgentId: null }),
    ])
  })

  it("gives a round its own day as its plan (adr-0098), and nothing else of the plan's", async () => {
    const { routine } = await setUp('todo', new Date('2026-10-05T08:00:00Z'))
    await createRoundsDue(TICK)
    const next = (await rounds(routine.id)).find(t => t.roundAt!.getTime() > TICK.getTime())!
    expect(next).toMatchObject({ planStart: new Date('2026-10-06T00:00:00Z'), planFinish: new Date('2026-10-06T00:00:00Z'), isEpic: false, epicId: null })
  })

  it('tells the board of the round it created', async () => {
    const { board } = await setUp('ready', new Date('2026-10-05T08:00:00Z'))
    vi.mocked(emitTaskUpdated).mockClear()
    await createRoundsDue(TICK)
    expect(emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })
})
