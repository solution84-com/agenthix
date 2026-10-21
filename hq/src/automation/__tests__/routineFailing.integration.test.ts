/**
 * The notice after three failed rounds in a row, against Postgres (spec §3): to
 * the routine's person, once per streak, cleared when a round succeeds; and the
 * scheduler's look takes only routines whose rounds changed, or that have a
 * notice open. Run by the lead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})

import { checkFailingRoutines, checkRoutine, resetFailingRoutinesLook } from '../routineFailing'
import { ROUTINE_FAILING_TYPE } from '../../notifications/notificationKinds'
import { routineIn, taskIn } from './automationWorld'

const DAY = 24 * 3_600_000
const NOW = new Date()

beforeEach(() => resetFailingRoutinesLook())

async function routineWith(states: Array<'failed' | 'done'>) {
  const project = await createProject()
  const person = await createUser()
  const routine = await routineIn(project.id, person.id, { title: 'Site audit' })
  // Oldest first, each a day apart, ending yesterday; and the round waiting for tomorrow.
  for (const [i, s] of states.entries()) {
    await taskIn(project.id, {
      routineId: routine.id, roundAt: new Date(NOW.getTime() - (states.length - i) * DAY),
      ...(s === 'failed' ? { runState: 'RUN_FAILED', runStateReason: 'timed out' } : { status: 'DONE' }),
    })
  }
  await taskIn(project.id, { routineId: routine.id, roundAt: new Date(NOW.getTime() + DAY) })
  return { project, person, routine }
}

const notices = (routineId: string) => prisma.notification.findMany({ where: { type: ROUTINE_FAILING_TYPE, subjectKey: routineId }, orderBy: { createdAt: 'asc' } })

describe('three failed rounds in a row @SC-687', () => {
  it('notify the routine\'s person, with a way to the routine', async () => {
    const { person, routine } = await routineWith(['done', 'failed', 'failed', 'failed'])
    await checkRoutine(routine.id, NOW)
    expect(await notices(routine.id)).toEqual([expect.objectContaining({
      userId: person.id, status: 'unread', title: 'Site audit failed 3 times in a row', actionUrl: `/routines/${routine.id}`, dismissible: false,
    })])
  })

  it('once per streak: a fourth failure raises nothing new', async () => {
    const { project, routine } = await routineWith(['failed', 'failed', 'failed'])
    await checkRoutine(routine.id, NOW)
    await taskIn(project.id, { routineId: routine.id, roundAt: new Date(NOW.getTime() - DAY / 2), runState: 'RUN_FAILED' })
    await checkRoutine(routine.id, NOW)
    expect(await notices(routine.id)).toHaveLength(1)
  })

  it('two failures are not enough', async () => {
    const { routine } = await routineWith(['done', 'failed', 'failed'])
    await checkRoutine(routine.id, NOW)
    expect(await notices(routine.id)).toEqual([])
  })

  it('is cleared when a round succeeds — a failed one run again counts — and a new streak reopens the same notice', async () => {
    const { project, routine } = await routineWith(['failed', 'failed', 'failed'])
    await checkRoutine(routine.id, NOW)
    const [newest] = await prisma.task.findMany({ where: { routineId: routine.id, runState: 'RUN_FAILED' }, orderBy: { roundAt: 'desc' }, take: 1 })
    await prisma.task.update({ where: { id: newest.id }, data: { runState: 'RUN_NONE', status: 'DONE' } })
    await checkRoutine(routine.id, NOW)
    expect((await notices(routine.id)).map(n => n.status)).toEqual(['handled'])

    for (const h of [12, 8, 4]) {
      await taskIn(project.id, { routineId: routine.id, roundAt: new Date(NOW.getTime() - h * 3_600_000), runState: 'RUN_FAILED' })
    }
    await checkRoutine(routine.id, NOW)
    expect((await notices(routine.id)).map(n => n.status)).toEqual(['unread'])
  })

  it('a routine deleted since has its notice cleared', async () => {
    const { routine } = await routineWith(['failed', 'failed', 'failed'])
    await checkRoutine(routine.id, NOW)
    await prisma.routine.delete({ where: { id: routine.id } })
    await checkFailingRoutines(NOW)
    expect((await notices(routine.id)).map(n => n.status)).toEqual(['handled'])
  })
})

describe("the scheduler's look", () => {
  it('first takes every routine with a round, then only those whose rounds changed since', async () => {
    const { routine } = await routineWith(['failed', 'failed', 'failed'])
    await checkFailingRoutines(NOW)
    expect(await notices(routine.id)).toHaveLength(1)

    // A streak whose rounds have not changed since the last look is not looked at.
    const quiet = await routineWith(['failed', 'failed', 'failed'])
    await prisma.task.updateMany({ where: { routineId: quiet.routine.id }, data: { updatedAt: new Date(NOW.getTime() - DAY) } })
    await checkFailingRoutines(new Date())
    expect(await notices(quiet.routine.id)).toEqual([])

    // One of its rounds changing is.
    await taskIn(quiet.project.id, { routineId: quiet.routine.id, roundAt: new Date(NOW.getTime() - 3_600_000), runState: 'RUN_FAILED' })
    await checkFailingRoutines(new Date())
    expect(await notices(quiet.routine.id)).toHaveLength(1)
  })
})
