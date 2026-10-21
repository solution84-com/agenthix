/**
 * `run.listPage` against a real database, paged to exhaustion.
 *
 * This is the test the unit suites could not be: hq's own suite models a
 * cursor as "every row below this position", which is what the contract SAYS,
 * and the boundary suite asserts the handler passes its params on. Neither
 * ever runs the query. The defect this file exists to catch lived entirely in
 * the gap — a predicate that read correctly, matched its test exactly, and
 * silently made part of a site's history unreachable.
 *
 * So the rule here is: page until the site says it is done, and assert on the
 * rows that came out rather than on the query that fetched them.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { runFeedKey, type RunRow } from '@agenthix/core'
import { listRunsPage } from '../runRows'

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

const AT = (iso: string) => new Date(iso)

let sessionId: string
let agentId: string

beforeEach(async () => {
  agentId = uniq('agent')
  sessionId = uniq('session')
  await prisma.agentSession.create({
    data: {
      id: sessionId,
      sessionKey: uniq('key'),
      agentId,
      userId: uniq('user'),
      sessionType: 'chat',
      createdAt: AT('2026-01-01T00:00:00.000Z'),
    },
  })
})

async function makeRun(opts: {
  id: string
  startedAt: Date | null
  createdAt: Date
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  taskId?: string
}) {
  return prisma.agentRun.create({
    data: {
      id: opts.id,
      sessionId,
      agentId,
      inputText: opts.id,
      model: 'claude-sonnet-5',
      status: opts.status ?? 'COMPLETED',
      startedAt: opts.startedAt,
      createdAt: opts.createdAt,
      taskId: opts.taskId ?? null,
    },
  })
}

/** Every row the site will give up, page by page, exactly as hq walks it. */
async function pageToExhaustion(limit: number, filter: Record<string, unknown> = {}): Promise<RunRow[]> {
  const seen: RunRow[] = []
  let before: string | undefined
  // A feed that stops advancing is the failure under test, so the walk is
  // bounded and an unbounded one fails loudly rather than hanging the suite.
  for (let page = 0; page < 20; page++) {
    const result = await listRunsPage({ ...filter, limit, before })
    seen.push(...result.runs)
    if (result.nextBefore === null) return seen
    expect(result.nextBefore).not.toBe(before)
    before = result.nextBefore
  }
  throw new Error('run.listPage never reported itself exhausted')
}

describe('run.listPage paged to exhaustion @SC-778', () => {
  it('gives up every run, including the started history below rows that never started', async () => {
    // The shape that broke: unstarted rows sorting above a started history.
    // Keyed on startedAt alone, the two below would be served and the site
    // would then declare itself finished with three rows still in it.
    await makeRun({ id: 'queued-1', startedAt: null, createdAt: AT('2026-03-01T00:00:02.000Z'), status: 'PENDING' })
    await makeRun({ id: 'queued-2', startedAt: null, createdAt: AT('2026-03-01T00:00:01.000Z'), status: 'FAILED' })
    await makeRun({ id: 'ran-1', startedAt: AT('2026-02-01T00:00:03.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })
    await makeRun({ id: 'ran-2', startedAt: AT('2026-02-01T00:00:02.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })
    await makeRun({ id: 'ran-3', startedAt: AT('2026-02-01T00:00:01.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })

    expect((await pageToExhaustion(2)).map((r) => r.id)).toEqual([
      'queued-1', 'queued-2', 'ran-1', 'ran-2', 'ran-3',
    ])
  })

  it('does not strand a site whose newest rows all failed before launching', async () => {
    // A run that went PENDING → FAILED keeps its null startedAt for ever, so
    // this is not a transient state a later page would clear.
    await makeRun({ id: 'never-ran', startedAt: null, createdAt: AT('2026-03-01T00:00:00.000Z'), status: 'FAILED' })
    await makeRun({ id: 'ran', startedAt: AT('2026-02-01T00:00:00.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })

    expect((await pageToExhaustion(1)).map((r) => r.id)).toEqual(['never-ran', 'ran'])
  })

  it('orders an unstarted run by when it was created, not above everything for ever', async () => {
    await makeRun({ id: 'ran-recently', startedAt: AT('2026-05-01T00:00:00.000Z'), createdAt: AT('2026-05-01T00:00:00.000Z') })
    await makeRun({ id: 'failed-long-ago', startedAt: null, createdAt: AT('2026-01-01T00:00:00.000Z'), status: 'FAILED' })

    expect((await pageToExhaustion(10)).map((r) => r.id)).toEqual(['ran-recently', 'failed-long-ago'])
  })

  it('gives up only the runs of the task ids asked for, however old the history they sit in', async () => {
    await makeRun({ id: 'other-new', startedAt: AT('2026-05-03T00:00:00.000Z'), createdAt: AT('2026-05-03T00:00:00.000Z'), taskId: 'task-other' })
    await makeRun({ id: 'mine-1', startedAt: AT('2026-05-02T00:00:00.000Z'), createdAt: AT('2026-05-02T00:00:00.000Z'), taskId: 'task-a' })
    await makeRun({ id: 'no-task', startedAt: AT('2026-05-01T12:00:00.000Z'), createdAt: AT('2026-05-01T12:00:00.000Z') })
    await makeRun({ id: 'mine-2', startedAt: AT('2026-05-01T00:00:00.000Z'), createdAt: AT('2026-05-01T00:00:00.000Z'), taskId: 'task-b' })

    expect((await pageToExhaustion(1, { taskIds: ['task-a', 'task-b'] })).map((r) => r.id)).toEqual(['mine-1', 'mine-2'])
    expect((await pageToExhaustion(5, { taskIds: [] })).map((r) => r.id)).toEqual([])
  })

  it('gives up only the runs of the session ids asked for', async () => {
    const otherSession = uniq('session')
    await prisma.agentSession.create({
      data: { id: otherSession, sessionKey: uniq('key'), agentId, userId: uniq('user'), sessionType: 'chat', createdAt: AT('2026-01-01T00:00:00.000Z') },
    })
    await makeRun({ id: 'in-session', startedAt: AT('2026-05-02T00:00:00.000Z'), createdAt: AT('2026-05-02T00:00:00.000Z') })
    await prisma.agentRun.create({
      data: { id: 'in-other', sessionId: otherSession, agentId, inputText: 'x', model: 'claude-sonnet-5', status: 'COMPLETED', startedAt: AT('2026-05-03T00:00:00.000Z'), createdAt: AT('2026-05-03T00:00:00.000Z') },
    })

    expect((await pageToExhaustion(1, { sessionIds: [sessionId] })).map((r) => r.id)).toEqual(['in-session'])
    expect((await pageToExhaustion(1, { sessionIds: [sessionId, otherSession] })).map((r) => r.id)).toEqual(['in-other', 'in-session'])
    expect((await pageToExhaustion(5, { sessionIds: [] })).map((r) => r.id)).toEqual([])
  })

  it('does not repeat or skip a row when several share a key to the millisecond', async () => {
    const shared = AT('2026-04-01T00:00:00.000Z')
    for (const id of ['tie-a', 'tie-b', 'tie-c', 'tie-d']) {
      await makeRun({ id, startedAt: shared, createdAt: shared })
    }

    const seen = await pageToExhaustion(2)
    expect(seen.map((r) => r.id)).toEqual(['tie-d', 'tie-c', 'tie-b', 'tie-a'])
    expect(new Set(seen.map((r) => r.id)).size).toBe(4)
  })

  it('keys a page on startedAt when it has one and createdAt when it does not', async () => {
    await makeRun({ id: 'late-start', startedAt: AT('2026-06-01T00:00:00.000Z'), createdAt: AT('2026-01-01T00:00:00.000Z') })
    const [row] = (await listRunsPage({ limit: 1 })).runs

    expect(runFeedKey(row)).toBe('2026-06-01T00:00:00.000Z')
    expect((await listRunsPage({ limit: 1 })).nextBefore).toBe('2026-06-01T00:00:00.000Z|late-start')
  })

  it('keeps the caller filter applied on every page, not only the first', async () => {
    const taskId = uniq('task')
    await makeRun({ id: 'task-1', startedAt: AT('2026-02-01T00:00:03.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z'), taskId })
    await makeRun({ id: 'other', startedAt: AT('2026-02-01T00:00:02.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })
    await makeRun({ id: 'task-2', startedAt: AT('2026-02-01T00:00:01.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z'), taskId })

    expect((await pageToExhaustion(1, { taskId })).map((r) => r.id)).toEqual(['task-1', 'task-2'])
  })

  it('passes a page size through the ceiling run.list already applies, not a second one', async () => {
    await makeRun({ id: 'only', startedAt: AT('2026-02-01T00:00:00.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })

    // Clamped to [1, MAX_LIST_LIMIT]: a zero would otherwise ask Postgres for
    // no rows at all and read as an exhausted site.
    expect((await listRunsPage({ limit: 0 })).runs).toHaveLength(1)
    expect((await listRunsPage({ limit: 50_000 })).runs).toHaveLength(1)
  })

  it('treats a cursor it cannot read as the first page rather than an error', async () => {
    await makeRun({ id: 'top', startedAt: AT('2026-02-01T00:00:00.000Z'), createdAt: AT('2026-02-01T00:00:00.000Z') })

    const page = await listRunsPage({ limit: 10, before: 'nonsense-with-no-separator' })
    expect(page.runs.map((r) => r.id)).toEqual(['top'])
  })
})
