/**
 * What the Routines screens read beside the routines (getRoutineRunFacts) against the real test database: each firing's
 * cost from its session's runs on the sites, today's runs and spending, each routine's instructions in a line; only
 * for a reader who is a member of the routine's project. The sites are replaced: what they answer is given here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser, joinProjectAs } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
const feed = vi.hoisted(() => ({ rows: [] as unknown[], asked: [] as string[][] }))
vi.mock('../../../sessions/mergedRunFeed', () => ({
  readMergedRunFeed: async (args: { filter: { sessionIds: string[] } }) => {
    feed.asked.push(args.filter.sessionIds)
    return { runs: feed.rows, nextCursor: null, unanswered: [] }
  },
}))

import { readRoutineRunFacts } from '../routineRunFacts'

const TODAY = '2026-11-07T00:00:00.000Z'
const usage = { inputTokens: 1_000_000, outputTokens: 0 }

async function world() {
  const project = await createProject({ accessLevel: 'PRIVATE' })
  const [kai, outsider] = await Promise.all([createUser(), createUser()])
  await joinProjectAs(project.id, kai.id, 'VIEWER')
  const routine = await prisma.routine.create({
    data: { projectId: project.id, title: 'Weekly link check', instructions: '# Check\n\n- every **link**', cron: '0 9 * * 1-5', timezone: 'UTC', onBehalfOfUserId: kai.id },
  })
  const run = (data: Record<string, unknown>) => prisma.routineRun.create({ data: { routineId: routine.id, onBehalfOfUserId: kai.id, ...data } as never })
  const [today, yesterday, skipped] = await Promise.all([
    run({ number: 2, state: 'FINISHED', sessionId: 's-today', startedAt: new Date('2026-11-07T09:00:00Z') }),
    run({ number: 1, state: 'FAILED', sessionId: 's-yesterday', startedAt: new Date('2026-11-06T09:00:00Z') }),
    run({ number: null, state: 'SKIPPED', startedAt: new Date('2026-11-07T10:00:00Z') }),
  ])
  return { project, kai, outsider, routine, today, yesterday, skipped }
}

beforeEach(() => { feed.rows = []; feed.asked = [] })

describe('getRoutineRunFacts @SC-RT2', () => {
  it("gives each firing its session's cost, and counts today's runs, a Viewer reading", async () => {
    const w = await world()
    feed.rows = [
      { sessionId: 's-today', usage, model: 'claude-sonnet-4-5' },
      { sessionId: 's-today', usage, model: 'claude-sonnet-4-5' },
      { sessionId: 's-yesterday', usage: null, model: 'claude-sonnet-4-5' },
    ]
    const facts = await readRoutineRunFacts({ projectId: w.project.id, todayFrom: TODAY }, w.kai.id)
    expect(feed.asked[0].sort()).toEqual(['s-today', 's-yesterday'])
    expect(Object.keys(facts.cost)).toEqual([w.today.id])
    expect(facts.today.ran).toBe(1)
    expect(facts.today.spent).toBe(facts.cost[w.today.id])
    expect(facts.about[w.routine.id]).toBe('Check every link')
  })

  it('reads one routine the same way', async () => {
    const w = await world()
    const facts = await readRoutineRunFacts({ routineId: w.routine.id, runs: 5, todayFrom: TODAY }, w.kai.id)
    expect(facts.today).toEqual({ ran: 1, running: 0, spent: 0 })
  })

  it("refuses someone who is not in the routine's project, and asks no site", async () => {
    const w = await world()
    await expect(readRoutineRunFacts({ projectId: w.project.id, todayFrom: TODAY }, w.outsider.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(readRoutineRunFacts({ routineId: w.routine.id, todayFrom: TODAY }, w.outsider.id)).rejects.toMatchObject({ statusCode: 403 })
    expect(feed.asked).toEqual([])
  })

  it('across projects, reads only the routines of projects the person is in', async () => {
    const w = await world()
    const facts = await readRoutineRunFacts({ todayFrom: TODAY }, w.outsider.id)
    expect(facts.about).toEqual({})
    expect((await readRoutineRunFacts({ todayFrom: TODAY }, w.kai.id)).about).toHaveProperty(w.routine.id)
  })
})
