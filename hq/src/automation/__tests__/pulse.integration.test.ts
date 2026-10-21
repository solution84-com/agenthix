/**
 * A boundary's pulse against Postgres (spec §2, adr-0088, adr-0091): hq code, not an agent run. It starts the first
 * task in the line of every free agent and, with the throttle on, opens a round that lets a batch per agent into
 * its line. TaskRunner is the shared fake, arranged to start the agent's first queued task the way the real claim
 * does; the end-to-end line behaviour has its own suite (agentLines.integration.test.ts), and the claim of a round
 * by two ticks is in schedulerClaim.integration.test.ts. Every call takes a fixed `now`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
const socket = vi.hoisted(() => ({ emitTaskUpdated: vi.fn() }))
vi.mock('../../server/socket', () => socket)

import { pulseProject, firePulsesDue, closeFinishedRounds, openRoundIfDue, startFreeAgents } from '../pulse'
import { ORG_AUTOMATION_DEFAULTS } from '../automationSettings'
import { startableNow } from '../../projects/notBeforeItsTime'
import * as taskRunnerFake from '../../test/fakes/TaskRunner'
import { boardOf, taskIn } from './automationWorld'

const ORG = { ...ORG_AUTOMATION_DEFAULTS, batchSize: 2 }
const DUE = new Date('2026-10-03T10:00:00Z')
const NOW = new Date('2026-10-03T10:00:30Z')
const runner = taskRunnerFake.taskRunner

/** What the real claim does for the pulse: the agent's first queued task in the project becomes the running one. */
function claimFirstQueued() {
  runner.startNext.mockImplementation(async (agent: { id: string }, projectId: string) => {
    const next = await prisma.task.findFirst({ where: { projectId, assignedAgentId: agent.id, runState: 'RUN_QUEUED', ...startableNow(NOW) }, orderBy: { createdAt: 'asc' } })
    if (!next) return null
    await prisma.task.update({ where: { id: next.id }, data: { runState: 'RUN_ACTIVE', runStartedBy: 'pulse' } })
    return { id: next.id, title: next.title, outcome: 'started' }
  })
}
beforeEach(() => {
  claimFirstQueued()
  socket.emitTaskUpdated.mockClear()
})

async function world(automation: Record<string, unknown> | null = {}) {
  const project = await createProject()
  const [x, y] = [await createAgent(), await createAgent()]
  const board = await boardOf(project.id)
  const row = automation
    ? await prisma.projectAutomation.create({ data: { projectId: project.id, enabled: true, pulseDueAt: DUE, ...automation } as any })
    : null
  const task = (agent: { id: string }, state: string, patch: Record<string, unknown> = {}) =>
    taskIn(project.id, { title: `T ${Math.random().toString(36).slice(2, 6)}`, assignedAgentId: agent.id, runState: state, boardId: board.id, ...patch })
  return { project, x, y, board, row: row!, task }
}

const stateOf = async (id: string) => (await prisma.task.findUnique({ where: { id } }))!.runState
const automationOf = (projectId: string) => prisma.projectAutomation.findUnique({ where: { projectId } })
const records = (projectId: string) => prisma.automationStart.findMany({ where: { projectId }, orderBy: { firedAt: 'asc' } })

describe("each agent's line, throttle off", () => {
  it('starts the first task in the line of every free agent, as the pulse, and records each start', async () => {
    const { project, x, y, row, task } = await world()
    const [x1, , y1] = [await task(x, 'RUN_QUEUED'), await task(x, 'RUN_QUEUED'), await task(y, 'RUN_QUEUED')]
    expect(await pulseProject(row, ORG, NOW)).toBe(true)
    expect(await stateOf(x1.id)).toBe('RUN_ACTIVE')
    expect(await stateOf(y1.id)).toBe('RUN_ACTIVE')
    const [record, ...rest] = await records(project.id)
    expect(rest).toEqual([])
    expect(record.kind).toBe('PULSE')
    expect((record.started as Array<Record<string, unknown>>).map(e => [e.taskId, e.agentHandle, e.outcome]).sort()).toEqual(
      [[x1.id, x.handle, 'started'], [y1.id, y.handle, 'started']].sort(),
    )
    expect((await automationOf(project.id))!.openRoundId).toBeNull()
  })

  it('leaves an agent already running a task in the project alone', async () => {
    const { project, x, y, task } = await world()
    await task(x, 'RUN_ACTIVE')
    const waitingX = await task(x, 'RUN_QUEUED')
    const waitingY = await task(y, 'RUN_QUEUED')
    const started = await startFreeAgents(project.id, NOW)
    expect(started.map(e => e.taskId)).toEqual([waitingY.id])
    expect(await stateOf(waitingX.id)).toBe('RUN_QUEUED')
  })

  it('an agent busy in another project is still free here', async () => {
    const { project, x, task } = await world()
    const other = await createProject()
    await taskIn(other.id, { assignedAgentId: x.id, runState: 'RUN_ACTIVE' })
    const queued = await task(x, 'RUN_QUEUED')
    expect((await startFreeAgents(project.id, NOW)).map(e => e.taskId)).toEqual([queued.id])
  })

  it('picks agents only from tasks someone asked to start or whose time has come — never one with a start or round time to come', async () => {
    const { project, x, y, task } = await world()
    const later = new Date('2026-10-03T12:00:00Z')
    await task(x, 'RUN_QUEUED', { scheduleNextDueAt: later })
    await task(x, 'RUN_QUEUED', { roundAt: later })
    const asked = await task(y, 'RUN_QUEUED', { scheduleNextDueAt: later, runStartedBy: 'person' })
    expect((await startFreeAgents(project.id, NOW)).map(e => e.taskId)).toEqual([asked.id])
    const due = await task(x, 'RUN_QUEUED', { scheduleNextDueAt: new Date('2026-10-03T09:00:00Z'), roundAt: new Date('2026-10-03T09:30:00Z') })
    expect((await startFreeAgents(project.id, NOW)).map(e => e.taskId)).toEqual([due.id])
  })

  it('ignores tasks that are not in a line: archived, unassigned, throttled or not queued', async () => {
    const { project, x, task } = await world()
    await task(x, 'RUN_QUEUED', { archived: true })
    await task(x, 'RUN_THROTTLED')
    await task(x, 'RUN_NONE')
    await taskIn(project.id, { runState: 'RUN_QUEUED' })
    expect(await startFreeAgents(project.id, NOW)).toEqual([])
    expect(runner.startNext).not.toHaveBeenCalled()
  })

  it('records a start that failed as failed, with its reason — never as started', async () => {
    const { project, x, row, task } = await world()
    const t = await task(x, 'RUN_QUEUED')
    runner.startNext.mockResolvedValue({ id: t.id, title: t.title, outcome: 'failed', reason: 'Project has no Execution Site' })
    await pulseProject(row, ORG, NOW)
    expect((await records(project.id))[0].started).toEqual([
      expect.objectContaining({ taskId: t.id, outcome: 'failed', reason: 'Project has no Execution Site' }),
    ])
  })

  it('records nothing when nothing started', async () => {
    const { project, row } = await world()
    expect(await pulseProject(row, ORG, NOW)).toBe(false)
    expect(await records(project.id)).toEqual([])
  })

  it("does nothing when the project's effective automation is off", async () => {
    const { project, x, row, task } = await world({ enabled: false })
    const t = await task(x, 'RUN_QUEUED')
    expect(await pulseProject(row, ORG, NOW)).toBe(false)
    expect(await pulseProject({ ...row, enabled: true }, { ...ORG, allowed: false }, NOW)).toBe(false)
    expect(await stateOf(t.id)).toBe('RUN_QUEUED')
    expect(await records(project.id)).toEqual([])
  })
})

describe('a round, throttle on', () => {
  it("opens when due, and lets up to the batch size of each agent's throttled tasks in, highest priority first", async () => {
    const { project, x, y, row, task } = await world({ throttle: true })
    const x1 = await task(x, 'RUN_THROTTLED', { priority: 'HIGH' })
    const x2 = await task(x, 'RUN_THROTTLED')
    const x3 = await task(x, 'RUN_THROTTLED', { priority: 'LOW' })
    const y1 = await task(y, 'RUN_THROTTLED')
    const round = await openRoundIfDue(row, 2, NOW)
    expect(round!.entries.map(e => [e.taskId, e.outcome])).toEqual([[x1.id, 'queued'], [x2.id, 'queued'], [y1.id, 'queued']])
    expect(await Promise.all([x1, x2, x3, y1].map(t => stateOf(t.id)))).toEqual(['RUN_QUEUED', 'RUN_QUEUED', 'RUN_THROTTLED', 'RUN_QUEUED'])
    expect(await automationOf(project.id)).toMatchObject({ openRoundId: round!.id, pulseDueAt: null })
    expect(await records(project.id)).toEqual([expect.objectContaining({ id: round!.id, kind: 'PULSE' })])
  })

  it('lets throttled tasks with a start or round time still to come stay out of the round', async () => {
    const { x, row, task } = await world({ throttle: true })
    const later = new Date('2026-10-03T12:00:00Z')
    const waiting = await task(x, 'RUN_THROTTLED', { scheduleNextDueAt: later })
    const waitingRound = await task(x, 'RUN_THROTTLED', { roundAt: later })
    expect(await openRoundIfDue(row, 2, NOW)).toBeNull()
    expect([await stateOf(waiting.id), await stateOf(waitingRound.id)]).toEqual(['RUN_THROTTLED', 'RUN_THROTTLED'])
  })

  it('is not due before its time, nor while a round is open, nor with nothing throttled', async () => {
    const { project, x, task } = await world({ throttle: true })
    const t = await task(x, 'RUN_THROTTLED')
    const row = (await automationOf(project.id))!
    expect(await openRoundIfDue({ ...row, pulseDueAt: new Date('2026-10-03T10:30:00Z') }, 2, NOW)).toBeNull()
    expect(await openRoundIfDue({ ...row, openRoundId: 'r0', pulseDueAt: null }, 2, NOW)).toBeNull()
    expect(await openRoundIfDue({ ...row, pulseDueAt: null }, 2, NOW)).toBeNull()
    expect(await stateOf(t.id)).toBe('RUN_THROTTLED')
    expect(await automationOf(project.id)).toMatchObject({ openRoundId: null, pulseDueAt: DUE })
    await prisma.task.update({ where: { id: t.id }, data: { runState: 'RUN_NONE' } })
    expect(await openRoundIfDue(row, 2, NOW)).toBeNull()
  })

  it('when every task was withdrawn meanwhile, opens no round and puts the due time back', async () => {
    const { project, x, row, task } = await world({ throttle: true })
    const t = await task(x, 'RUN_THROTTLED')
    // A person withdraws the task after the round has read it and before it lets it in.
    const realFindMany = prisma.task.findMany.bind(prisma.task)
    const spy = vi.spyOn(prisma.task, 'findMany').mockImplementationOnce(((args: any) =>
      realFindMany(args).then(async rows => {
        await prisma.task.update({ where: { id: t.id }, data: { runState: 'RUN_NONE' } })
        return rows
      })) as never)
    expect(await openRoundIfDue(row, 2, NOW)).toBeNull()
    spy.mockRestore()
    expect(await automationOf(project.id)).toMatchObject({ openRoundId: null, pulseDueAt: DUE })
    expect(await records(project.id)).toEqual([])
  })

  it('records how the first of each batch started, the rest queued to run after it', async () => {
    const { project, x, row, task } = await world({ throttle: true })
    const x1 = await task(x, 'RUN_THROTTLED', { priority: 'HIGH' })
    const x2 = await task(x, 'RUN_THROTTLED')
    expect(await pulseProject(row, ORG, NOW)).toBe(true)
    expect([await stateOf(x1.id), await stateOf(x2.id)]).toEqual(['RUN_ACTIVE', 'RUN_QUEUED'])
    const [record, ...rest] = await records(project.id)
    expect(rest).toEqual([])
    expect(record.started).toEqual([
      expect.objectContaining({ taskId: x1.id, outcome: 'started' }),
      expect.objectContaining({ taskId: x2.id, outcome: 'queued' }),
    ])
  })

  it("tells the project's boards when a round opens, and not when none is due", async () => {
    const { board, x, row, task } = await world({ throttle: true })
    await task(x, 'RUN_THROTTLED')
    await openRoundIfDue({ ...row, pulseDueAt: new Date('2026-10-03T11:00:00Z') }, 2, NOW)
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
    expect(await openRoundIfDue(row, 2, NOW)).not.toBeNull()
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })
})

describe('which boundaries the pulse visits', () => {
  it('none at all while the org has automation off', async () => {
    const { x, task } = await world()
    const t = await task(x, 'RUN_QUEUED')
    expect(await firePulsesDue({ ...ORG, allowed: false }, NOW)).toBe(0)
    expect(await stateOf(t.id)).toBe('RUN_QUEUED')
  })

  it('those with automation on and queued or throttled work, and no others', async () => {
    const busy = await world()
    const idle = await world()
    const off = await world({ enabled: false })
    const noRow = await world(null)
    const throttled = await world({ throttle: true })
    const busyTask = await busy.task(busy.x, 'RUN_QUEUED')
    await off.task(off.x, 'RUN_QUEUED')
    await noRow.task(noRow.x, 'RUN_QUEUED')
    const heldTask = await throttled.task(throttled.x, 'RUN_THROTTLED')
    await idle.task(idle.x, 'RUN_NONE')
    expect(await firePulsesDue(ORG, NOW)).toBe(2)
    expect(await stateOf(busyTask.id)).toBe('RUN_ACTIVE')
    expect(await stateOf(heldTask.id)).toBe('RUN_ACTIVE')
    expect(await records(idle.project.id)).toEqual([])
  })

  it('one boundary failing does not stop the others', async () => {
    const first = await world()
    const second = await world()
    const t1 = await first.task(first.x, 'RUN_QUEUED')
    const t2 = await second.task(second.x, 'RUN_QUEUED')
    runner.startNext.mockImplementationOnce(async () => { throw new Error('site gone') })
    expect(await firePulsesDue(ORG, NOW)).toBe(1)
    expect([await stateOf(t1.id), await stateOf(t2.id)].sort()).toEqual(['RUN_ACTIVE', 'RUN_QUEUED'])
  })
})

describe('closing a round', () => {
  async function openRound(batch: number) {
    const w = await world({ throttle: true, intervalMinutes: 45 })
    const tasks: Awaited<ReturnType<typeof w.task>>[] = []
    for (let i = 0; i < batch; i++) tasks.push(await w.task(w.x, 'RUN_THROTTLED'))
    const round = await openRoundIfDue(w.row, batch, NOW)
    socket.emitTaskUpdated.mockClear()
    return { ...w, tasks, round: round! }
  }

  it('stays open while a task it let through is still queued or running, and tells no board', async () => {
    const { project, tasks } = await openRound(2)
    await prisma.task.update({ where: { id: tasks[0].id }, data: { runState: 'RUN_NONE' } })
    expect(await closeFinishedRounds(ORG, NOW)).toBe(0)
    expect((await automationOf(project.id))!.openRoundId).not.toBeNull()
    expect(socket.emitTaskUpdated).not.toHaveBeenCalled()
  })

  it('closes once none is queued or running, and stores the next an interval after now, on its minute', async () => {
    const { project, tasks, board } = await openRound(1)
    await prisma.task.update({ where: { id: tasks[0].id }, data: { runState: 'RUN_FAILED' } })
    expect(await closeFinishedRounds(ORG, NOW)).toBe(1)
    expect(await automationOf(project.id)).toMatchObject({
      openRoundId: null, lastRoundFinishedAt: NOW, pulseDueAt: new Date('2026-10-03T10:46:00Z'),
    })
    expect(socket.emitTaskUpdated).toHaveBeenCalledWith(board.id)
  })

  it('a round whose record is gone closes, having nothing left to wait for', async () => {
    const { project, round } = await openRound(1)
    await prisma.automationStart.delete({ where: { id: round.id } })
    expect(await closeFinishedRounds(ORG, NOW)).toBe(1)
    expect((await automationOf(project.id))!.openRoundId).toBeNull()
  })
})
