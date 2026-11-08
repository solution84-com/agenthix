/**
 * A routine's firings (adr-0177, adr-0088) against the real test database: one run per firing through the routine
 * dispatch (replaced here: what leaves hq), claimed by compare-and-set so two ticks fire once; a firing while the
 * last run is going is skipped and listed; Run now is one run on behalf of whoever pressed it; and the races between
 * them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})

const dispatch = vi.hoisted(() => ({
  calls: [] as Array<{ routineId: string; routineRunId: string; number: number; personId: string; startedBy: string; instructions: string }>,
  fail: null as Error | null,
  /** Held open until released, to race something against a dispatch in flight. */
  gate: null as Promise<void> | null,
}))
vi.mock('../routineDispatch', async () => {
  const { prisma } = await import('../../test/db')
  return {
    dispatchRoutineRun: vi.fn(async (s: { routine: { id: string; instructions: string }; routineRunId: string; number: number; personId: string; startedBy: string }) => {
      const sessionId = `session-${s.routineRunId}`
      await prisma.routineRun.update({ where: { id: s.routineRunId }, data: { sessionId, siteId: 'site-1', timeLimitMinutes: 30 } })
      if (dispatch.gate) await dispatch.gate
      if (dispatch.fail) throw dispatch.fail
      dispatch.calls.push({ routineId: s.routine.id, routineRunId: s.routineRunId, number: s.number, personId: s.personId, startedBy: s.startedBy, instructions: s.routine.instructions })
      return { runId: `run-${s.number}`, sessionId, siteId: 'site-1' }
    }),
  }
})
vi.mock('../../notifications/persistent', () => ({
  raisePersistentNotification: vi.fn(async () => undefined), clearPersistentNotification: vi.fn(async () => undefined),
}))

import { claimDue, fireRoutinesDue, isLost, runRoutineNow, LOST_RUN_MARGIN_MS } from '../routineFiring'
import { changeRoutine, ROUTINE_LOST_ACCESS_REASON } from '../routines'
import { addMember, assignAgent, createProjectWithUsers, routineIn } from './automationWorld'

const DUE = new Date('2026-10-06T09:00:00Z')
const TICK = new Date('2026-10-06T09:00:00.500Z')

beforeEach(() => {
  dispatch.calls.length = 0
  dispatch.fail = null
  dispatch.gate = null
})

async function world() {
  const { project, users } = await createProjectWithUsers()
  await addMember(project.id, users.person.id)
  await addMember(project.id, users.member.id)
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Reviewer', handle: 'reviewer' } })
  await assignAgent(project.id, 'agent-1')
  const routine = await routineIn(project.id, users.person.id, { agentId: 'agent-1' })
  return { project, routine, ...users }
}

const runsOf = (routineId: string) => prisma.routineRun.findMany({ where: { routineId }, orderBy: { createdAt: 'asc' } })
const routineOf = (id: string) => prisma.routine.findUniqueOrThrow({ where: { id } })

describe('a scheduled firing', () => {
  it('starts one run on behalf of the routine\'s person, numbered, and moves its due time on to the next', async () => {
    const { routine, person } = await world()
    expect(await fireRoutinesDue(TICK)).toBe(1)
    expect(dispatch.calls).toEqual([expect.objectContaining({ number: 1, personId: person.id, startedBy: 'schedule' })])
    expect(await runsOf(routine.id)).toEqual([expect.objectContaining({
      number: 1, dueAt: DUE, state: 'RUNNING', runId: 'run-1', sessionId: expect.any(String), onBehalfOfUserId: person.id, startedByUserId: null,
    })])
    expect((await routineOf(routine.id)).nextDueAt).toEqual(new Date('2026-10-07T09:00:00Z'))
  })

  it('fires once for times missed while hq was down, not once per time', async () => {
    const { routine } = await world()
    await fireRoutinesDue(new Date('2026-10-09T12:00:00Z'))
    expect(dispatch.calls).toHaveLength(1)
    expect((await routineOf(routine.id)).nextDueAt).toEqual(new Date('2026-10-10T09:00:00Z'))
  })

  it('does not fire a routine that is off, or not yet due', async () => {
    const { project, person } = await world()
    await routineIn(project.id, person.id, { agentId: 'agent-1', enabled: false })
    await routineIn(project.id, person.id, { agentId: 'agent-1', nextDueAt: new Date('2026-10-06T09:02:00Z') })
    expect(await fireRoutinesDue(TICK)).toBe(1)
  })

  it('is skipped, and listed, while the last run is still going', async () => {
    const { routine } = await world()
    await fireRoutinesDue(TICK)
    // Due again five minutes on, well inside the first run's 30-minute limit: that run is still going.
    const again = new Date('2026-10-06T09:05:00Z')
    await prisma.routine.update({ where: { id: routine.id }, data: { nextDueAt: again } })
    await fireRoutinesDue(again)
    expect(dispatch.calls).toHaveLength(1)
    const runs = await runsOf(routine.id)
    expect(runs.map(r => [r.number, r.state, r.reason])).toEqual([[1, 'RUNNING', null], [null, 'SKIPPED', 'Run 1 was still going']])
  })

  it('a run whose end was never heard of stops counting as going after its time limit and a margin', async () => {
    const { routine } = await world()
    await fireRoutinesDue(TICK)
    const [first] = await runsOf(routine.id)
    expect(isLost(first, new Date(first.startedAt.getTime() + 30 * 60_000))).toBe(false)
    const later = new Date(first.startedAt.getTime() + 30 * 60_000 + LOST_RUN_MARGIN_MS + 1)
    expect(isLost(first, later)).toBe(true)
    await prisma.routine.update({ where: { id: routine.id }, data: { nextDueAt: later } })
    await fireRoutinesDue(later)
    expect((await runsOf(routine.id)).map(r => [r.number, r.state])).toEqual([[1, 'FAILED'], [2, 'RUNNING']])
  })

  it('whose person can no longer work in the project switches the routine off, saying why, and starts nothing', async () => {
    const { routine, person, project } = await world()
    await prisma.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: person.id } } })
    await fireRoutinesDue(TICK)
    expect(dispatch.calls).toHaveLength(0)
    expect(await routineOf(routine.id)).toMatchObject({ enabled: false, nextDueAt: null, pausedReason: ROUTINE_LOST_ACCESS_REASON })
    expect((await runsOf(routine.id)).map(r => r.state)).toEqual(['FAILED'])
  })

  it('with no agent, or one taken off the project, is listed as failed, and the routine keeps its schedule', async () => {
    const { routine, project } = await world()
    await prisma.projectAgent.deleteMany({ where: { projectId: project.id } })
    await fireRoutinesDue(TICK)
    expect(await runsOf(routine.id)).toEqual([expect.objectContaining({ state: 'FAILED', reason: expect.stringMatching(/no longer assigned/) })])
    expect((await routineOf(routine.id)).enabled).toBe(true)
  })

  it('that its site refuses is listed as failed with why, and frees the routine for its next firing', async () => {
    const { routine } = await world()
    dispatch.fail = new Error("the site wasn't answering")
    await fireRoutinesDue(TICK)
    dispatch.fail = null
    await fireRoutinesDue(new Date('2026-10-07T09:00:00Z'))
    expect((await runsOf(routine.id)).map(r => [r.number, r.state, r.reason])).toEqual([[1, 'FAILED', "the site wasn't answering"], [2, 'RUNNING', null]])
  })
})

describe('races', () => {
  it('two ticks at once fire it once', async () => {
    const { routine } = await world()
    const fired = await Promise.all([fireRoutinesDue(TICK), fireRoutinesDue(TICK), fireRoutinesDue(TICK)])
    expect(fired.reduce((a, b) => a + b, 0)).toBe(1)
    expect(dispatch.calls).toHaveLength(1)
    expect(await runsOf(routine.id)).toHaveLength(1)
  })

  it('a claim read before a schedule change does not fire on the old time', async () => {
    const { routine, member } = await world()
    const read = await routineOf(routine.id)
    await changeRoutine(routine.id, { cron: '30 9 * * *' }, { kind: 'person', userId: member.id }, new Date('2026-10-06T08:59:00Z'))
    expect(await claimDue(read, TICK)).toBeNull()
    expect((await routineOf(routine.id)).nextDueAt).toEqual(new Date('2026-10-06T09:30:00Z'))
  })

  it('a change that keeps the due time fires as the routine is when it is claimed, its next time from the new rule', async () => {
    const { routine, member } = await world()
    const read = await routineOf(routine.id)
    // Same 09:00 today (a Tuesday), but Tuesdays only from now on; and new instructions, on another person's behalf.
    await changeRoutine(routine.id, { cron: '0 9 * * 2', instructions: 'Review it twice' }, { kind: 'person', userId: member.id }, new Date('2026-10-06T08:59:00Z'))
    const claimed = await claimDue(read, TICK)
    expect(claimed).toMatchObject({ instructions: 'Review it twice', onBehalfOfUserId: member.id, nextDueAt: new Date('2026-10-13T09:00:00Z') })
  })

  it('a change saved while a firing is being claimed never moves that firing on', async () => {
    const { routine, member } = await world()
    await Promise.all([
      fireRoutinesDue(TICK),
      changeRoutine(routine.id, { instructions: 'Review it twice' }, { kind: 'person', userId: member.id }, TICK),
    ])
    expect(dispatch.calls).toHaveLength(1)
    expect((await routineOf(routine.id)).nextDueAt).toEqual(new Date('2026-10-07T09:00:00Z'))
  })

  it('Run now while a firing is going is refused, and starts nothing', async () => {
    const { routine, member } = await world()
    await fireRoutinesDue(TICK)
    await expect(runRoutineNow(routine.id, member.id, TICK)).rejects.toThrow('Run 1 is still going: this routine runs one run at a time. Press Run now again once it has ended. Nothing was changed.')
    expect(await runsOf(routine.id)).toHaveLength(1)
  })

  it('Run now and a firing at the same moment start one run between them', async () => {
    const { routine, member } = await world()
    const results = await Promise.allSettled([fireRoutinesDue(TICK), runRoutineNow(routine.id, member.id, TICK)])
    expect(dispatch.calls).toHaveLength(1)
    const runs = await runsOf(routine.id)
    expect(runs.filter(r => r.state === 'RUNNING')).toHaveLength(1)
    // Whichever came second was skipped (the firing) or refused (Run now).
    expect(runs.filter(r => r.state === 'SKIPPED').length + results.filter(r => r.status === 'rejected').length).toBe(1)
  })

  it('two Run nows at once start one run', async () => {
    const { routine, member, person } = await world()
    const results = await Promise.allSettled([runRoutineNow(routine.id, member.id, TICK), runRoutineNow(routine.id, person.id, TICK)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(dispatch.calls).toHaveLength(1)
  })

  it('a firing that comes while a run is still being dispatched is skipped', async () => {
    const { routine } = await world()
    let release!: () => void
    dispatch.gate = new Promise(r => { release = r })
    const first = fireRoutinesDue(TICK)
    // Wait until the first firing holds its place.
    for (let i = 0; i < 50 && (await runsOf(routine.id)).length === 0; i++) await new Promise(r => setTimeout(r, 20))
    await prisma.routine.update({ where: { id: routine.id }, data: { nextDueAt: new Date('2026-10-06T09:05:00Z') } })
    await fireRoutinesDue(new Date('2026-10-06T09:05:00Z'))
    release()
    await first
    expect((await runsOf(routine.id)).map(r => r.state)).toEqual(['RUNNING', 'SKIPPED'])
  })
})

describe('Run now (N6)', () => {
  it('is one run on behalf of whoever pressed it, listed as theirs, and changes nothing about whose routine it is', async () => {
    const { routine, person, member } = await world()
    const run = await runRoutineNow(routine.id, member.id, TICK)
    expect(run).toMatchObject({ number: 1, dueAt: null, startedByUserId: member.id, onBehalfOfUserId: member.id, state: 'RUNNING' })
    expect(dispatch.calls).toEqual([expect.objectContaining({ personId: member.id, startedBy: 'person' })])
    expect(await routineOf(routine.id)).toMatchObject({ onBehalfOfUserId: person.id, nextDueAt: routine.nextDueAt })
  })

  it('is refused while the routine is off', async () => {
    const { routine, member } = await world()
    await prisma.routine.update({ where: { id: routine.id }, data: { enabled: false, nextDueAt: null } })
    await expect(runRoutineNow(routine.id, member.id, TICK)).rejects.toThrow(/It is off.*Nothing was changed/)
    expect(dispatch.calls).toHaveLength(0)
  })
})
